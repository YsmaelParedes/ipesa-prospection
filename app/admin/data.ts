import { useCachedQuery } from '@/lib/useCachedQuery'


import { PAID_SUBSCRIPTION_STATUSES, PLANS, effectivePlan, planOf, type PlanId, type StoreStatus } from '@/lib/stores'
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
  members: number; contacts: number; activities: number; whatsapp_connected: boolean; last_activity_at: string | null
  /** Precio mensual acordado con la tienda (null = sin acordar) */
  monthly_price: number | null
  /** Módulos activos (WhatsApp lo activa el panel; Campañas y Fórmulas, fuera de la plataforma) */
  modules: { whatsapp?: boolean; campaigns?: boolean } | null
  /** Pidió WhatsApp desde la tienda ("Quiero activarlo"); se limpia al activarlo */
  whatsapp_requested_at: string | null
  /** Suscripción de Stripe (null = sin suscripción) */
  subscription_status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
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

/** Plan que aplica hoy (una cortesía vencida ya cuenta como Litro). */
export const planNow = (st: PlatformStore, now = Date.now()): PlanId => effectivePlan(st, now)

/** Paga con una suscripción de Stripe vigente (activa o reintentando el cobro). */
export const isStripePaid = (st: PlatformStore) =>
  (PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(st.subscription_status ?? '')

/** Stripe no pudo cobrar: reintenta (past_due) o ya se rindió (unpaid). */
export const isPastDue = (st: PlatformStore) => st.subscription_status === 'past_due' || st.subscription_status === 'unpaid'

const manualPaid = (st: PlatformStore) => (st.plan === 'galon' || st.plan === 'cubeta') && !isStripePaid(st) && !!st.paid_until

/** Cortesía o pago a mano de Galón/Cubeta que vence en menos de 7 días. */
export function expiresSoon(st: PlatformStore, now = Date.now()) {
  if (!manualPaid(st) || planNow(st, now) === 'litro') return false
  return new Date(st.paid_until!).getTime() - now < 7 * DAY
}

/** Cortesía o pago a mano vencido: la tienda ya trabaja en Litro. */
export const isLapsed = (st: PlatformStore, now = Date.now()) => manualPaid(st) && planNow(st, now) === 'litro'

export const isOff = (st: PlatformStore) => st.status === 'suspended' || st.status === 'cancelled'

/** Estado de antes de los planes con Stripe (ya no se crea ninguna así). */
export const isPending = (st: Pick<PlatformStore, 'status'>) => st.status === 'pending'

/** Pidió WhatsApp y aún no se le activa: un asesor debe contactarla. */
export const wantsWhatsApp = (st: Pick<PlatformStore, 'modules' | 'whatsapp_requested_at'>) =>
  !!st.whatsapp_requested_at && !st.modules?.whatsapp

/** Panel de Stripe del cliente (para revisar cobros, facturas o reembolsos). */
export const stripeCustomerUrl = (st: PlatformStore) =>
  st.stripe_customer_id ? `https://dashboard.stripe.com/customers/${encodeURIComponent(st.stripe_customer_id)}` : null

export function subscriptionLine(st: PlatformStore) {
  if (isOff(st)) return st.status === 'suspended' ? 'Suspendida (solo lectura)' : 'Cancelada (solo lectura)'
  const plan = planNow(st)
  const label = PLANS[plan].label
  if (isStripePaid(st)) {
    if (st.subscription_status === 'past_due') return `${label} · pago fallido, Stripe reintenta el cobro`
    if (st.cancel_at_period_end) return `${label} · se cancela el ${fmtDate(st.current_period_end)}`
    return `${label} · Stripe, próximo cobro ${fmtDate(st.current_period_end, { day: 'numeric', month: 'short' })}`
  }
  if (plan === 'interno') return 'Interno · cortesía sin vencimiento'
  if (isLapsed(st)) return `Litro · su ${planOf(st.plan).label} a mano venció el ${fmtDate(st.paid_until)}`
  if (st.plan === 'galon' || st.plan === 'cubeta') return st.paid_until ? `${label} a mano · hasta ${fmtDate(st.paid_until)}` : `${label} a mano · sin vencimiento`
  return 'Litro · gratis'
}

export function countStores(list: PlatformStore[], now = Date.now()) {
  const on = list.filter(st => !isOff(st))
  const by = (p: PlanId) => on.filter(st => planNow(st, now) === p).length
  return {
    all: list.length,
    litro: by('litro'),
    galon: by('galon'),
    cubeta: by('cubeta'),
    interno: by('interno'),
    stripe: list.filter(isStripePaid).length,
    pastDue: list.filter(isPastDue).length,
    expiring: list.filter(st => expiresSoon(st, now)).length,
    lapsed: list.filter(st => isLapsed(st, now)).length,
    off: list.filter(isOff).length,
  }
}

/**
 * Cobros a mano del Resumen (las suscripciones las cobra Stripe y se ven en
 * su panel): lo cobrado en el mes de `payments` y lo que vence en < 7 días de
 * las cortesías con precio acordado.
 */
export function moneySummary(stores: PlatformStore[], payments: StorePayment[], now = Date.now()) {
  const live = payments.filter(p => !p.voided_at)
  const due = stores.filter(st => expiresSoon(st, now))
  return {
    collected: live.reduce((t, p) => t + p.amount, 0),
    paymentsCount: live.length,
    dueAmount: due.reduce((t, st) => t + (st.monthly_price ?? 0), 0), dueCount: due.length,
  }
}

/** Mes actual como YYYY-MM (hora local). */
export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Pagos de un mes (`{ month: 'YYYY-MM' }`) o de una tienda (`{ store: id }`). */
export function usePayments(filter: { month: string } | { store: string } | null) {
  const qs = !filter ? null : 'month' in filter ? 'month=' + encodeURIComponent(filter.month) : 'store=' + encodeURIComponent(filter.store)
  const query = useCachedQuery<{ payments: StorePayment[] }>(qs ? '/api/platform/payments?' + qs : null)
  return { payments: query.data?.payments ?? null, error: query.error?.message ?? '', reload: query.reload }
}

/** Lista de tiendas; `reload` la vuelve a pedir (después de guardar un cambio). */
export function usePlatformStores() {
  const query = useCachedQuery<{ stores: PlatformStore[] }>('/api/platform/stores')
  return { stores: query.data?.stores ?? null, error: query.error?.message ?? '', reload: query.reload }
}

/** Error de producción agrupado (la misma falla suma 1 al contador). */
export type PlatformError = {
  id: number
  source: 'server' | 'client' | 'cron' | 'webhook' | 'render' | 'whatsapp' | 'test'
  context: string
  message: string
  count: number
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  store_id: string | null
  store_name: string | null
}

/** Errores de los últimos 14 días (/api/platform/errors); `reload` los vuelve a pedir. */
export function useRecentErrors() {
  const query = useCachedQuery<{ errors: PlatformError[] }>('/api/platform/errors')
  return { errors: query.data?.errors ?? null, error: query.error?.message ?? '', reload: query.reload }
}
