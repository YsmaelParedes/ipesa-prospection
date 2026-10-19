/**
 * Sesión en el navegador: usuario, tienda activa, rol y módulos (de
 * /api/me). Se comparte durante 60 segundos; invalidateSession()
 * la vuelve a pedir (cambio de tienda, de nombre, de configuración).
 * Solo decide qué se MUESTRA: cada ruta de la API vuelve a validar todo.
 */
import { useEffect, useState } from 'react'
import type { PlanId, StoreAccess, StoreModules, StoreRole, StoreStatus } from './stores'
import { broadcastSessionChange, setQueryContext } from './apiClient'

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
  /** Plan que aplica hoy (una cortesía vencida ya cuenta como Litro) */
  plan: PlanId
  planLabel: string
  maxUsers: number
  /** El plan permite nombrar administradores además del dueño */
  allowAdmins: boolean
  /** Límites del plan (null = sin límite) */
  limits: { contacts: number | null; leads: number | null }
  /** El plan incluye la bandeja de WhatsApp (Cubeta); además el asesor debe conectarlo */
  planIncludesWhatsApp: boolean
  /** Suscripción de Stripe (null = plan gratis o asignado a mano) */
  subscription: { status: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null
  /** Puede abrir el portal de Stripe (facturas, tarjeta, cancelar) */
  billingPortal: boolean
  paidUntil: string | null
  access: StoreAccess
  modules: StoreModules
  onboardingCompleted: boolean
  /** Pidió activar WhatsApp y un asesor lo contactará */
  whatsappRequestedAt: string | null
}

export type Session = {
  user: { id: string; email: string; name: string }
  store: ClientStore | null
  role?: StoreRole
  isAdmin?: boolean
  isOwner?: boolean
  /** Plan Litro: solo entra el dueño; el resto del equipo ve un aviso */
  ownerOnlyBlocked?: boolean
  stores: { id: string; name: string; role: StoreRole; logoUrl: string | null }[]
  platformAdmin: boolean
}

const EVENT = 'crm:session-changed'
let sessionPromise: Promise<Session | null> | null = null
let sessionValue: Session | null | undefined
let sessionAt = 0
let sessionGeneration = 0
let consumers = 0
let stopRefresh: (() => void) | undefined

export function loadSession(): Promise<Session | null> {
  if (sessionValue !== undefined && Date.now() - sessionAt < 60_000) return Promise.resolve(sessionValue)
  if (!sessionPromise) {
    const generation = sessionGeneration
    sessionPromise = fetch('/api/me', { cache: 'no-store' })
      .then(async r => {
        if (!r.ok && r.status !== 401) throw new Error('No se pudo comprobar la sesión')
        const value: Session | null = r.ok ? await r.json() : null
        if (generation !== sessionGeneration) return loadSession()
        sessionValue = value; sessionAt = Date.now()
        setQueryContext(value)
        window.dispatchEvent(new Event(EVENT))
        return value
      })
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
