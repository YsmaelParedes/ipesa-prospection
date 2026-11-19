/**
 * Reglas de cobro con Stripe que no dependen del SDK (se prueban sin red y
 * las usa también el navegador): qué precio de Stripe corresponde a qué plan
 * y cómo una suscripción se traduce al plan de la tienda.
 *
 * Los precios se crean en el panel de Stripe con estos lookup keys; así el
 * monto se cambia allá (transfiriendo el lookup key a un precio nuevo) sin
 * publicar código.
 */
import { PAID_SUBSCRIPTION_STATUSES, type PaidPlanId } from './stores'

/** Cada cuánto se cobra: mensual o anual (el anual cuesta 10 meses: 2 gratis). */
export type PlanInterval = 'month' | 'year'
export const isPlanInterval = (v: unknown): v is PlanInterval => v === 'month' || v === 'year'

export const PRICE_LOOKUP: Record<PaidPlanId, string> = {
  galon: 'galon_mensual',
  cubeta: 'cubeta_mensual',
}
export const PRICE_LOOKUP_ANNUAL: Record<PaidPlanId, string> = {
  galon: 'galon_anual',
  cubeta: 'cubeta_anual',
}
export const lookupKeyFor = (plan: PaidPlanId, interval: PlanInterval) =>
  (interval === 'year' ? PRICE_LOOKUP_ANNUAL : PRICE_LOOKUP)[plan]
export const ALL_LOOKUP_KEYS = [...Object.values(PRICE_LOOKUP), ...Object.values(PRICE_LOOKUP_ANNUAL)]

export const isPaidPlanId = (v: unknown): v is PaidPlanId => v === 'galon' || v === 'cubeta'

/** Plan de un precio de Stripe por su lookup key, mensual o anual (null si no es de Matices). */
export function planFromLookupKey(key: string | null | undefined): PaidPlanId | null {
  if (!key) return null
  for (const map of [PRICE_LOOKUP, PRICE_LOOKUP_ANNUAL]) {
    for (const [plan, lookup] of Object.entries(map)) if (lookup === key) return plan as PaidPlanId
  }
  return null
}

/** Lo mínimo de una suscripción de Stripe que usa el CRM (para no depender del SDK aquí). */
export type SubscriptionLike = {
  id: string
  status: string
  customer: string | { id: string }
  cancel_at_period_end: boolean
  /** Fecha programada de término (segundos). La API actual la usa al cancelar desde el portal. */
  cancel_at?: number | null
  metadata?: Record<string, string> | null
  items: { data: { current_period_end?: number | null; price: { lookup_key: string | null } }[] }
}

export type SubscriptionSnapshot = {
  subscriptionId: string
  customerId: string
  status: string
  /** Plan del precio suscrito; null si no es un precio de Matices */
  plan: PaidPlanId | null
  /** Próximo cobro o, si está programada para terminar, la fecha en que termina */
  periodEnd: string | null
  /** Ya no se renueva: termina en periodEnd y la tienda pasa a Litro */
  cancelAtPeriodEnd: boolean
  storeId: string | null
}

/**
 * Datos de la suscripción para apply_stripe_subscription. En la API actual
 * de Stripe la fecha de cobro vive en cada concepto (items.data[].current_period_end)
 * y cancelar desde el portal programa `cancel_at` (cancel_at_period_end queda en false).
 */
export function subscriptionSnapshot(sub: SubscriptionLike): SubscriptionSnapshot {
  const item = sub.items.data.find(i => planFromLookupKey(i.price.lookup_key)) ?? sub.items.data[0]
  const end = sub.cancel_at || item?.current_period_end
  return {
    subscriptionId: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status,
    plan: planFromLookupKey(item?.price.lookup_key),
    periodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
    storeId: sub.metadata?.store_id || null,
  }
}

/** La suscripción sigue dando su plan (activa, en prueba o reintentando el cobro). */
export const subscriptionGivesPlan = (status: string | null | undefined) =>
  (PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? '')

/** Precio de un plan para mostrar ("$499" al mes). */
export type PlanPrice = { amount: number; currency: string; interval: string }

/** Precio mensual de cada plan de paga (falta el que Stripe no tenga configurado). */
export type PublicPrices = Partial<Record<PaidPlanId, PlanPrice>>
/** Mensual y anual de cada plan (el anual puede faltar si aún no se crea en Stripe). */
export type PriceTable = { monthly: PublicPrices; annual: PublicPrices }

/** Lo que equivale al mes un precio anual, en pesos enteros (el monto exacto va en «Pagas $8,990 al año»). */
export const monthlyEquivalent = (p: PlanPrice): PlanPrice => ({ ...p, amount: Math.round(p.amount / 12), interval: 'month' })

/** Meses que se ahorran pagando el año en lugar de 12 mensualidades (redondeado). */
export function monthsSaved(monthly: PlanPrice | undefined, annual: PlanPrice | undefined): number {
  if (!monthly || !annual || monthly.amount <= 0) return 0
  return Math.max(0, Math.round((monthly.amount * 12 - annual.amount) / monthly.amount))
}

export function formatPlanPrice(p: PlanPrice | null | undefined): string | null {
  if (!p) return null
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: p.currency.toUpperCase(),
    maximumFractionDigits: Number.isInteger(p.amount) ? 0 : 2,
  }).format(p.amount)
}

/** $1,497 · $499.50 · USD 99 (la moneda es la que trae Stripe; por omisión, pesos) */
export const fmtMoney = (n: number, currency = 'mxn') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n)
