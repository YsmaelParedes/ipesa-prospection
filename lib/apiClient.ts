'use client'

import { loadSession, invalidateSession, type Session } from './profile'
import { QueryCache, QueryError } from './queryCache'
import { mutationResources, normalizedPath, queryPolicy } from './queryPolicy'

type Payload = { body: string; status: number; headers: [string, string][] }
export const queryCache = new QueryCache(Date.now, () => announce())
let context = ''
let epoch = 0
let channel: BroadcastChannel | undefined
let initialized = false
let batchDepth = 0
const deferred = new Set<string>()
const loaders = new Map<string, (signal: AbortSignal) => Promise<Payload>>()
const updates = new Set<() => void>()
let diagnosticCount = 0
let collecting: ((path: string) => void) | undefined
export function collectQueryReads<T>(collect: (path: string) => void, work: () => T): T {
  const previous = collecting
  collecting = collect
  try { return work() } finally { collecting = previous }
}
export const subscribeQueryStatus = (fn: () => void) => { updates.add(fn); return () => { updates.delete(fn) } }
const announce = () => { for (const fn of updates) fn() }

export function sessionScope(s: Session | null | undefined) {
  return s ? JSON.stringify([s.user.id, s.store?.id, s.role, s.store?.modules, s.store?.access, s.store?.status, s.store?.plan]) : ''
}
export function setQueryContext(s: Session | null) {
  const next = sessionScope(s)
  if (next !== context) { context = next; clearQueryCache(); announce() }
}
export function clearQueryCache() { epoch++; queryCache.clear(); loaders.clear(); prefetchQueue.clear(); announce() }
export function queryKey(path: string) {
  return JSON.stringify([context, path.startsWith('/api/platform/') ? 'platform' : 'crm', normalizedPath(path)])
}
export function keyPath(key: string): string { return JSON.parse(key)[2] }
/** Initialize a view from memory during render; never starts a request. */
export function cachedQueryData<T = any>(path: string): T | undefined {
  const value = queryCache.peek<Payload>(queryKey(path))?.data
  return value ? JSON.parse(value.body) as T : undefined
}
export function matchesResource(path: string, resource: string) {
  const base = path.split('?')[0]
  return resource.includes('?') ? path === normalizedPath(resource) : base === resource || base.startsWith(resource.endsWith('/') ? resource : resource + '/')
}
export function invalidateQueries(resources: string[], broadcast = true) {
  if (batchDepth) { resources.forEach(r => deferred.add(r)); return }
  queryCache.invalidate(key => resources.some(r => matchesResource(keyPath(key), r)))
  announce()
  if (broadcast) channel?.postMessage({ type: 'invalidate', scope: context, resources })
}
export async function batchQueryChanges<T>(work: () => Promise<T>): Promise<T> {
  batchDepth++
  try { return await work() } finally {
    if (--batchDepth === 0 && deferred.size) { const resources = [...deferred]; deferred.clear(); invalidateQueries(resources) }
  }
}
export function broadcastContextChange() {
  initializeQueries()
  clearQueryCache()
  channel?.postMessage({ type: 'context' })
}
export function broadcastSessionChange() {
  initializeQueries()
  channel?.postMessage({ type: 'session' })
}
function initializeQueries() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('crm:queries')
    channel.onmessage = ({ data }) => {
      if (data?.type === 'context') { clearQueryCache(); window.location.reload(); return }
      if (data?.type === 'session') { invalidateSession(false); return }
      if (data?.type === 'invalidate' && data.scope === context && Array.isArray(data.resources) && data.resources.every((r: unknown) => typeof r === 'string')) {
        invalidateQueries(data.resources, false)
        if (data.resources.includes('/api/')) invalidateSession(false)
      }
    }
  }
  const refresh = (focus: boolean) => {
    if (document.visibilityState !== 'visible') return
    for (const key of queryCache.refreshable(focus)) {
      const loader = loaders.get(key), policy = queryPolicy(keyPath(key))
      if (loader && policy) void queryCache.read(key, loader, policy, true).catch(() => {})
    }
    queryCache.prune()
    // Do not retain loaders for arbitrarily many search URLs.
    for (const key of loaders.keys()) if (!queryCache.peek(key)) loaders.delete(key)
    announce()
  }
  window.addEventListener('focus', () => refresh(true))
  document.addEventListener('visibilitychange', () => refresh(true))
  setInterval(() => refresh(false), 1000)
}

function retryDelay(value: string | null) {
  if (!value) return 0
  const seconds = Number(value)
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(value) - Date.now()) || 0
}
async function checkAccess(response: Response) {
  if (response.status === 401) {
    clearQueryCache()
    invalidateSession(false)
    if (typeof window !== 'undefined') window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname))
  } else if (response.status === 403) invalidateSession(false)
}

/** Explicit fetch adapter; it never patches window.fetch or caches writes/media. */
export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const start = performance.now()
  let status = 0
  try {
    const result = await fetchWithCache(input, init)
    status = result.status
    return result
  } catch (error) {
    if (error instanceof QueryError) status = error.status
    throw error
  } finally {
    if (typeof window !== 'undefined' && typeof input === 'string' && input.startsWith('/api/')) {
      // Only the resource family is recorded: never IDs, search terms, cookies or payloads.
      try {
        const resource = input.split('?')[0].split('/').slice(0, 4).join('/')
        if (++diagnosticCount > 200) { performance.clearMeasures('crm:api'); diagnosticCount = 1 }
        performance.measure('crm:api', { start, end: performance.now(), detail: { resource, method: init?.method ?? 'GET', status } })
      } catch { /* Diagnostics must never interrupt a successful request. */ }
    }
  }
}

async function fetchWithCache(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input !== 'string' || !input.startsWith('/api/')) return fetch(input, init)
  initializeQueries()
  const method = (init?.method ?? 'GET').toUpperCase()
  const path = normalizedPath(input)
  const liveThread = method === 'GET' && /^\/api\/whatsapp\/conversations\/[^/]+(?:\?|$)/.test(path) && new Headers(init?.headers).get('x-crm-read') === '1'
  const policy = liveThread ? { staleTime: 0, maxAge: 0 } : method === 'GET' ? queryPolicy(path) : null
  if (policy && !liveThread) collecting?.(path)
  if (!policy) {
    const response = await fetch(input, { ...init, cache: 'no-store' })
    await checkAccess(response)
    if (response.ok && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      invalidateQueries(mutationResources(path))
      if (path.startsWith('/api/store') || path.startsWith('/api/platform/') || path === '/api/me') invalidateSession(false)
      if (path === '/api/stores/switch') broadcastContextChange()
    }
    return response
  }
  const session = await loadSession()
  if (!session) throw new QueryError('La sesión expiró', 401)
  const key = liveThread ? JSON.stringify([context, 'crm', path, 'mark-read']) : queryKey(path), requestEpoch = epoch
  const loader = async (signal: AbortSignal): Promise<Payload> => {
    const response = await fetch(path, { ...init, signal, cache: 'no-store' })
    await checkAccess(response)
    const body = await response.text()
    if (!response.ok) {
      let message = 'No se pudieron actualizar los datos'
      try { message = JSON.parse(body).error || message } catch {}
      throw new QueryError(message, response.status, retryDelay(response.headers.get('Retry-After')))
    }
    // Reject non-JSON responses (e.g. an unexpected login redirect).
    JSON.parse(body)
    return { body, status: response.status, headers: [...response.headers.entries()] }
  }
  loaders.set(key, loader)
  const hit = queryCache.peek<Payload>(key)
  let result: Payload
  if (hit?.data && init?.cache !== 'reload') {
    result = hit.data
    if (Date.now() - hit.updatedAt >= policy.staleTime) void queryCache.read(key, loader, policy).catch(() => {})
  } else result = await queryCache.read(key, loader, policy, init?.cache === 'reload')
  if (requestEpoch !== epoch || init?.signal?.aborted) throw new DOMException('Consulta reemplazada', 'AbortError')
  return new Response(result.body, { status: result.status, headers: result.headers })
}

const prefetchRoutes: Record<string, string[]> = {
  '/': ['/api/data/dashboard?includeWhatsApp=0', '/api/data/reminders'],
  '/contactos': ['/api/data/contacts?facets=1&limit=50', '/api/data/config'],
  '/comercial': ['/api/data/commercial'],
  '/recordatorios': ['/api/data/reminders', '/api/data/commercial'],
  '/formulas': ['/api/formulas'],
  '/whatsapp': ['/api/whatsapp/conversations?filter=all'],
  '/configuracion': ['/api/data/config'],
}
const prefetchAllowed = new Set(Object.values(prefetchRoutes).flat())
const prefetchQueue = new Set<string>()
let prefetchRunning = 0
export function prefetchQuery(path: string) {
  if ((!prefetchAllowed.has(path) && !/^\/api\/platform\/payments\?month=\d{4}-\d{2}$/.test(path)) || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return
  prefetchQueue.add(path)
  const drain = () => {
    while (prefetchRunning < 2 && prefetchQueue.size) {
      const next = prefetchQueue.values().next().value!
      prefetchQueue.delete(next); prefetchRunning++
      void apiFetch(next).catch(() => {}).finally(() => { prefetchRunning--; drain() })
    }
  }
  drain()
}
export async function prefetchRoute(href: string) {
  const path = href.split('?')[0], session = await loadSession()
  if (!session || !session.store || path === '/formulas' && !session.store?.modules.formulas || path === '/whatsapp' && !session.store?.modules.whatsapp) return
  for (const url of prefetchRoutes[path] ?? []) prefetchQuery(url)
}
