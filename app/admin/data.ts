import { useCallback, useEffect, useState } from 'react'
import { storeAccess, trialDaysLeft, type StoreStatus } from '@/lib/stores'

/**
 * Datos del panel del dueño (/admin): todas las tiendas con su dueño, uso y
 * suscripción. La API (/api/platform/stores) vuelve a validar que quien
 * llama sea administrador de la plataforma.
 */

export type PlatformStore = {
  id: string; slug: string; name: string; city: string | null; state: string | null; phone: string | null
  status: StoreStatus; plan: string; trial_ends_at: string | null; paid_until: string | null; created_at: string
  onboarding_completed_at: string | null; platform_notes: string | null
  owner_email: string | null; owner_name: string | null
  members: number; contacts: number; leads: number; whatsapp_connected: boolean; last_activity_at: string | null
}

export const DAY = 86_400_000

export const fmtDate = (iso: string | null, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', o) : '—'

export const ago = (iso: string | null) => {
  if (!iso) return 'Sin actividad'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
  return d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : d < 30 ? `Hace ${d} días` : fmtDate(iso)
}

/** Con acceso completo, pero la prueba termina en ≤ 3 días o el pago vence en < 7. */
export function expiresSoon(st: PlatformStore, now = Date.now()) {
  if (storeAccess(st, now) !== 'full') return false
  if (st.status === 'trial') return (trialDaysLeft(st, now) ?? 99) <= 3
  return !!st.paid_until && new Date(st.paid_until).getTime() - now < 7 * DAY
}

/** En prueba o activa, pero ya en solo lectura (prueba o pago vencido). */
export const isLapsed = (st: PlatformStore, now = Date.now()) =>
  (st.status === 'trial' || st.status === 'active') && storeAccess(st, now) === 'readonly'

export const isOff = (st: PlatformStore) => st.status === 'suspended' || st.status === 'cancelled'

export function subscriptionLine(st: PlatformStore) {
  const readonly = storeAccess(st) === 'readonly'
  if (st.status === 'trial') {
    const left = trialDaysLeft(st) ?? 0
    return readonly ? `Prueba vencida el ${fmtDate(st.trial_ends_at)}` : `Prueba: ${left} ${left === 1 ? 'día' : 'días'} (hasta ${fmtDate(st.trial_ends_at, { day: 'numeric', month: 'short' })})`
  }
  if (st.status === 'active') {
    if (!st.paid_until) return 'Activa sin vencimiento'
    return readonly ? `Pago vencido el ${fmtDate(st.paid_until)}` : `Pagada hasta ${fmtDate(st.paid_until)}`
  }
  return st.status === 'suspended' ? 'Suspendida' : 'Cancelada'
}

export function countStores(list: PlatformStore[], now = Date.now()) {
  const full = (st: PlatformStore) => storeAccess(st, now) === 'full'
  return {
    all: list.length,
    trial: list.filter(st => st.status === 'trial' && full(st)).length,
    active: list.filter(st => st.status === 'active' && full(st)).length,
    expiring: list.filter(st => expiresSoon(st, now)).length,
    readonly: list.filter(st => isLapsed(st, now)).length,
    off: list.filter(isOff).length,
  }
}

/** Lista de tiendas; `reload` la vuelve a pedir (después de guardar un cambio). */
export function usePlatformStores() {
  const [stores, setStores] = useState<PlatformStore[] | null>(null)
  const [error, setError]   = useState('')

  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/platform/stores', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar las tiendas')
      setStores(d.stores)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => { reload() }, [reload])

  return { stores, error, reload }
}
