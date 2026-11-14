/**
 * Sesión en el navegador: usuario, tienda activa, rol y módulos (de
 * /api/me). Se comparte durante 60 segundos; invalidateSession()
 * la vuelve a pedir (cambio de tienda, de nombre, de configuración).
 * Solo decide qué se MUESTRA: cada ruta de la API vuelve a validar todo.
 */
import { useEffect, useState } from 'react'
import type { StoreRole } from './stores'
import type { publicStore } from './storeServer'
import { broadcastSessionChange, setQueryContext } from './apiClient'

/** La tienda tal como la manda el servidor (publicStore en lib/storeServer.ts): un solo lugar para agregar campos. */
export type ClientStore = ReturnType<typeof publicStore>

export type Session = {
  user: { id: string; email: string; name: string }
  store: ClientStore | null
  role?: StoreRole
  isAdmin?: boolean
  /** Plan Litro: solo entra el administrador; los vendedores ven un aviso */
  litroBlocked?: boolean
  stores: { id: string; name: string; role: StoreRole; logoUrl: string | null }[]
}

const EVENT = 'crm:session-changed'
let sessionPromise: Promise<Session | null> | null = null
let sessionValue: Session | null | undefined
let sessionAt = 0
let sessionGeneration = 0
let consumers = 0
let stopRefresh: (() => void) | undefined
// Freno contra ráfagas: si la sesión ya se pidió 5 veces en 10 s (un ciclo de
// invalidaciones), las siguientes esperan 3 s entre sí; si /api/me falla, se
// espera cada vez más antes de reintentar. Sin esto, un ciclo pedía la sesión
// ~3 veces por segundo y ayudó a saturar el servidor. Lo normal (una recarga
// por cambio de tienda, de nombre o de plan) no se retrasa.
const BURST_WINDOW_MS = 10_000
const BURST_LIMIT = 5
const BURST_GAP_MS = 3_000
const MAX_SESSION_BACKOFF_MS = 30_000
let recentFetches: number[] = []
let failures = 0

const delay = (ms: number) => new Promise<void>(resolve => { if (ms > 0) setTimeout(resolve, ms); else resolve() })

function sessionFetchDelay(now: number): number {
  recentFetches = recentFetches.filter(t => now - t < BURST_WINDOW_MS)
  const last = recentFetches[recentFetches.length - 1] ?? 0
  const gap = Math.max(
    recentFetches.length >= BURST_LIMIT ? BURST_GAP_MS : 0,
    failures ? Math.min(MAX_SESSION_BACKOFF_MS, 1_000 * 2 ** (failures - 1)) : 0,
  )
  return last ? Math.max(0, last + gap - now) : 0
}

export function loadSession(): Promise<Session | null> {
  if (sessionValue !== undefined && Date.now() - sessionAt < 60_000) return Promise.resolve(sessionValue)
  if (!sessionPromise) {
    const generation = sessionGeneration
    sessionPromise = delay(sessionFetchDelay(Date.now()))
      .then(() => { recentFetches.push(Date.now()); return fetch('/api/me', { cache: 'no-store' }) })
      .then(async r => {
        if (!r.ok && r.status !== 401) throw new Error('No se pudo comprobar la sesión')
        const value: Session | null = r.ok ? await r.json() : null
        failures = 0
        if (generation !== sessionGeneration) return loadSession()
        sessionValue = value; sessionAt = Date.now()
        setQueryContext(value)
        window.dispatchEvent(new Event(EVENT))
        return value
      }, error => { failures++; throw error })
      .finally(() => { if (generation === sessionGeneration) sessionPromise = null })
  }
  return sessionPromise
}

/** Vuelve a pedir la sesión y avisa a los componentes montados. */
export function invalidateSession(broadcast = true) {
  sessionGeneration++
  sessionPromise = null
  sessionAt = 0
  if (broadcast) broadcastSessionChange()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** undefined = cargando · null = sin sesión */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(() => sessionValue)
  useEffect(() => {
    let alive = true
    const load = () => { void loadSession().then(s => { if (alive) setSession(s) }).catch(() => {}) }
    load()
    window.addEventListener(EVENT, load)
    if (++consumers === 1) {
      const refresh = () => { if (document.visibilityState === 'visible') void loadSession().catch(() => {}) }
      const timer = setInterval(refresh, 60_000)
      window.addEventListener('focus', refresh)
      document.addEventListener('visibilitychange', refresh)
      stopRefresh = () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
    }
    return () => { alive = false; window.removeEventListener(EVENT, load); if (--consumers === 0) stopRefresh?.() }
  }, [])
  return session
}
