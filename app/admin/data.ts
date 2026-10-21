import { useCachedQuery } from '@/lib/useCachedQuery'
import { PAID_SUBSCRIPTION_STATUSES, PLANS, effectivePlan, type PlanId, type StoreStatus } from '@/lib/stores'
import type { BillingOverview, PlatformInvoice } from '@/lib/platformBilling'

/**
 * Datos del panel del dueño (/admin): todas las tiendas con su dueño, uso y
 * suscripción de Stripe. La API (/api/platform/…) vuelve a validar que quien
 * llama sea administrador de la plataforma.
 */

export type PlatformStore = {
  id: string; slug: string; name: string; city: string | null; state: string | null; phone: string | null
  status: StoreStatus; plan: string; trial_ends_at: string | null; paid_until: string | null; created_at: string
  onboarding_completed_at: string | null; platform_notes: string | null
  owner_email: string | null; owner_name: string | null
  members: number; contacts: number; activities: number; whatsapp_connected: boolean; last_activity_at: string | null
  /** Módulos activos (WhatsApp lo activa el panel; Campañas y Fórmulas, fuera de la plataforma) */
  modules: { whatsapp?: boolean; campaigns?: boolean } | null
  /** Pidió WhatsApp desde la tienda ("Quiero activarlo"); se limpia al activarlo */
  whatsapp_requested_at: string | null
  /** Suscripción de Stripe (null = sin suscripción) */
  subscription_status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  /** Eliminación por inactividad (lib/storeRetention.ts) */
  last_used_at: string | null
  retention_idle: boolean
  retention_protected: boolean
  retention_hold: boolean
  deletion_scheduled_for: string | null
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

/** Plan que aplica hoy. */
export const planNow = (st: PlatformStore, now = Date.now()): PlanId => effectivePlan(st, now)

/** Paga con una suscripción de Stripe vigente (activa o reintentando el cobro). */
export const isStripePaid = (st: PlatformStore) =>
  (PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(st.subscription_status ?? '')

/** Stripe no pudo cobrar: reintenta (past_due) o ya se rindió (unpaid). */
export const isPastDue = (st: PlatformStore) => st.subscription_status === 'past_due' || st.subscription_status === 'unpaid'

/** Paga con Stripe pero ya no se renueva: al terminar el periodo baja a Litro. */
export const isCancelling = (st: PlatformStore) => isStripePaid(st) && st.cancel_at_period_end

/** Plan de paga o Interno sin suscripción: se lo diste tú desde el panel. */
export const isCourtesy = (st: PlatformStore) => !isStripePaid(st) && planNow(st) !== 'litro'

/** Tiene fecha para eliminarse por inactividad (ya se avisó al dueño). */
export const isDeletionScheduled = (st: PlatformStore) => !!st.deletion_scheduled_for

export const isOff = (st: PlatformStore) => st.status === 'suspended' || st.status === 'cancelled'

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
    if (isPastDue(st)) return `${label} · pago fallido, Stripe reintenta el cobro`
    if (st.cancel_at_period_end) return `${label} · se cancela el ${fmtDate(st.current_period_end)}`
    return `${label} · próximo cobro ${fmtDate(st.current_period_end, { day: 'numeric', month: 'short' })}`
  }
  if (plan === 'interno') return 'Interno · sin cobro'
  if (plan !== 'litro') return `${label} · cortesía, sin cobro`
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
    cancelling: list.filter(isCancelling).length,
    courtesy: on.filter(st => isCourtesy(st) && planNow(st, now) !== 'interno').length,
    deleting: list.filter(isDeletionScheduled).length,
    off: list.filter(isOff).length,
  }
}

/** Lista de tiendas; `reload` la vuelve a pedir (después de guardar un cambio). */
export function usePlatformStores() {
  const query = useCachedQuery<{ stores: PlatformStore[] }>('/api/platform/stores')
  return { stores: query.data?.stores ?? null, error: query.error?.message ?? '', reload: query.reload }
}

/** Ingreso y cobros del mes leídos de Stripe; `billing` null si Stripe no respondió. */
export function useBilling() {
  const query = useCachedQuery<{ available: boolean; billing?: BillingOverview }>('/api/platform/billing')
  return { loading: !query.data && !query.error, billing: query.data?.billing ?? null }
}

/** Últimas facturas de Stripe de una tienda (null mientras cargan). */
export function useInvoices(storeId: string | null) {
  const query = useCachedQuery<{ invoices: PlatformInvoice[] }>(storeId ? `/api/platform/stores/${storeId}/invoices` : null)
  return { invoices: query.data?.invoices ?? null, error: query.error?.message ?? '' }
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
