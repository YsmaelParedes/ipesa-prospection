import { useCallback, useEffect, useState } from 'react'
import { storeAccess, trialDaysLeft, type StoreStatus } from '@/lib/stores'
import type { StorePayment } from '@/lib/payments'

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
  /** Precio mensual acordado con la tienda (null = sin acordar) */
  monthly_price: number | null
  /** Módulos activos (WhatsApp y Campañas los activa el panel) */
  modules: { whatsapp?: boolean; campaigns?: boolean } | null
  /** Pidió WhatsApp desde la tienda ("Quiero activarlo"); se limpia al activarlo */
  whatsapp_requested_at: string | null
  /** Invitación de dueño pendiente (solo si la tienda aún no tiene dueño) */
  owner_invite: { email: string; expires_at: string; status: 'valid' | 'expired' | 'used' | 'revoked' } | null
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

/** Tienda nueva que espera su primer pago o cortesía. */
export const isPending = (st: Pick<PlatformStore, 'status'>) => st.status === 'pending'

/** Pidió WhatsApp y aún no se le activa: un asesor debe contactarla. */
export const wantsWhatsApp = (st: Pick<PlatformStore, 'modules' | 'whatsapp_requested_at'>) =>
  !!st.whatsapp_requested_at && !st.modules?.whatsapp

export function subscriptionLine(st: PlatformStore) {
  if (st.status === 'pending') return 'Por activar: falta su primer pago o cortesía'
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
    pending: list.filter(isPending).length,
    trial: list.filter(st => st.status === 'trial' && full(st)).length,
    active: list.filter(st => st.status === 'active' && full(st)).length,
    expiring: list.filter(st => expiresSoon(st, now)).length,
    readonly: list.filter(st => isLapsed(st, now)).length,
    off: list.filter(isOff).length,
  }
}

/**
 * Cifras de dinero del Resumen, con el precio acordado de cada tienda:
 *  · cobrado: pagos (no anulados) del mes que se pasa en `payments`;
 *  · ingreso mensual: tiendas activas con acceso completo;
 *  · por cobrar: activas cuyo pago vence en < 7 días;
 *  · adeudo: activas o en prueba ya en solo lectura.
 * `unpriced` cuenta las activas con vencimiento pero sin precio acordado
 * (el ingreso mensual se queda corto por ellas).
 */
export function moneySummary(stores: PlatformStore[], payments: StorePayment[], now = Date.now()) {
  const price = (st: PlatformStore) => st.monthly_price ?? 0
  const sum = (list: PlatformStore[]) => list.reduce((t, st) => t + price(st), 0)
  const live = payments.filter(p => !p.voided_at)
  const activeFull = stores.filter(st => st.status === 'active' && storeAccess(st, now) === 'full')
  const due = activeFull.filter(st => expiresSoon(st, now))
  const debt = stores.filter(st => isLapsed(st, now))
  return {
    collected: live.reduce((t, p) => t + p.amount, 0),
    paymentsCount: live.length,
    monthly: sum(activeFull),
    unpriced: activeFull.filter(st => st.monthly_price === null && st.paid_until !== null).length,
    dueAmount: sum(due), dueCount: due.length,
    debtAmount: sum(debt), debtCount: debt.length,
  }
}

/** Mes actual como YYYY-MM (hora local). */
export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Pagos de un mes (`{ month: 'YYYY-MM' }`) o de una tienda (`{ store: id }`). */
export function usePayments(filter: { month: string } | { store: string } | null) {
  const [payments, setPayments] = useState<StorePayment[] | null>(null)
  const [error, setError]       = useState('')
  const qs = !filter ? null : 'month' in filter ? `month=${filter.month}` : `store=${filter.store}`

  const reload = useCallback(async () => {
    if (!qs) return
    try {
      const r = await fetch(`/api/platform/payments?${qs}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudieron cargar los pagos')
      setPayments(d.payments)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [qs])
  useEffect(() => { setPayments(null); reload() }, [reload])

  return { payments, error, reload }
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
