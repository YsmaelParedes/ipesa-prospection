/**
 * Sesión en el navegador: usuario, tienda activa, rol y módulos (de
 * /api/me). Se memoiza durante la vida de la pestaña; invalidateSession()
 * la vuelve a pedir (cambio de tienda, de nombre, de configuración).
 * Solo decide qué se MUESTRA: cada ruta de la API vuelve a validar todo.
 */
import { useEffect, useState } from 'react'
import type { StoreAccess, StoreModules, StoreRole, StoreStatus } from './stores'

export type ClientStore = {
  id: string
  slug: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  logoUrl: string | null
  status: StoreStatus
  plan: string
  planLabel: string
  maxUsers: number
  trialEndsAt: string | null
  trialDaysLeft: number | null
  paidUntil: string | null
  access: StoreAccess
  modules: StoreModules
  onboardingCompleted: boolean
}

export type Session = {
  user: { id: string; email: string; name: string }
  store: ClientStore | null
  role?: StoreRole
  isAdmin?: boolean
  isOwner?: boolean
  stores: { id: string; name: string; role: StoreRole; logoUrl: string | null }[]
  platformAdmin: boolean
}

const EVENT = 'crm:session-changed'
let sessionPromise: Promise<Session | null> | null = null

export function loadSession(): Promise<Session | null> {
  if (!sessionPromise) {
    sessionPromise = fetch('/api/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() as Promise<Session> : null))
      .catch(() => { sessionPromise = null; return null })
  }
  return sessionPromise
}

/** Vuelve a pedir la sesión y avisa a los componentes montados. */
export function invalidateSession() {
  sessionPromise = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** undefined = cargando · null = sin sesión */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const load = () => loadSession().then(s => { if (alive) setSession(s) })
    load()
    window.addEventListener(EVENT, load)
    return () => { alive = false; window.removeEventListener(EVENT, load) }
  }, [])
  return session
}
