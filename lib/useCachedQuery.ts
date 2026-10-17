'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList, type EffectCallback } from 'react'
import { apiFetch, collectQueryReads, keyPath, matchesResource, queryCache, queryKey, subscribeQueryStatus } from './apiClient'
import { useSession } from './profile'

/** Existing data effects subscribe only to the reads they actually perform. */
export function useQueryEffect(effect: EffectCallback, deps: DependencyList) {
  useEffect(() => {
    let disposed = false, scheduled = false
    let cleanup: ReturnType<EffectCallback>
    const paths = new Set<string>()
    const run = () => {
      if (disposed) return
      cleanup?.()
      cleanup = collectQueryReads(path => paths.add(path), effect)
    }
    const unsubscribe = queryCache.subscribe(key => paths.has(keyPath(key)), () => {
      if (scheduled || disposed) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        if ([...paths].some(path => queryCache.peek(queryKey(path))?.fetching)) return
        run()
      })
    })
    run()
    return () => { disposed = true; unsubscribe(); cleanup?.() }
  }, deps)
}

/** Subscribe an existing view loader to shared updates without changing its local form state. */
export function useQueryRefresh(resources: string[], reload: () => void) {
  const ref = useRef(reload)
  ref.current = reload
  const signature = JSON.stringify(resources)
  useEffect(() => {
    const paths: string[] = JSON.parse(signature)
    let scheduled = false, alive = true
    const unsubscribe = queryCache.subscribe(key => paths.some(path => matchesResource(keyPath(key), path)), key => {
      if (queryCache.peek(key)?.fetching) return
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => { scheduled = false; if (alive) ref.current() })
    })
    return () => { alive = false; unsubscribe() }
    // Subscribers detach on unmount; requests remain shared with other consumers.
  }, [signature])
}

/** Browser diagnostic: first committed usable state, followed by the next animation frame. */
export function useDataReady(loading: boolean, section: string) {
  const start = useRef<number | null>(null)
  const recorded = useRef(false)
  useEffect(() => { start.current = performance.now() }, [])
  useEffect(() => {
    if (loading || recorded.current || start.current === null) return
    const frame = requestAnimationFrame(() => {
      recorded.current = true
      if (performance.getEntriesByName('crm:view-ready').length >= 100) performance.clearMeasures('crm:view-ready')
      performance.measure('crm:view-ready', { start: start.current!, end: performance.now(), detail: { section } })
    })
    return () => cancelAnimationFrame(frame)
  }, [loading, section])
}

export function useCachedQuery<T>(path: string | null) {
  const session = useSession()
  const [, render] = useState(0)
  const key = path && session ? queryKey(path) : null
  const reload = useCallback(async () => {
    if (path && session) await apiFetch(path, { cache: 'reload' }).catch(() => {})
  }, [path, session])
  useEffect(() => {
    if (!key || !path) return
    const stop = queryCache.subscribe(k => k === key, () => render(n => n + 1))
    void apiFetch(path).catch(() => {}).finally(() => render(n => n + 1))
    let hasData = !!queryCache.peek(key)?.data
    const status = subscribeQueryStatus(() => {
      const next = !!queryCache.peek(key)?.data
      if (next !== hasData) { hasData = next; render(n => n + 1) }
    })
    return () => { stop(); status() }
  }, [key, path])
  const snapshot = key ? queryCache.peek<{ body: string }>(key) : undefined
  const body = snapshot?.data?.body
  const data = useMemo(() => body === undefined ? undefined : JSON.parse(body) as T, [body])
  // Invalidated active queries reload, while inactive entries wait for their next consumer.
  useEffect(() => {
    if (path && key && !snapshot?.data && !snapshot?.fetching && !snapshot?.error) void apiFetch(path).catch(() => {})
  }, [path, key, snapshot?.data, snapshot?.fetching, snapshot?.error])
  return { data, error: snapshot?.error, loading: !data && !snapshot?.error, updating: snapshot?.fetching ?? false, reload }
}
