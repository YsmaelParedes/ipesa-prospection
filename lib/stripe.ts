/**
 * Cliente de Stripe (solo servidor). Las llaves viven en variables de entorno:
 *   STRIPE_SECRET_KEY      llave secreta (sk_test_… en pruebas, sk_live_… en producción)
 *   STRIPE_WEBHOOK_SECRET  secreto de firma del webhook (whsec_…)
 * Sin STRIPE_SECRET_KEY el cobro queda "Disponible pronto" y nada se rompe.
 */
import Stripe from 'stripe'
import { PRICE_LOOKUP, planFromLookupKey, type PlanPrice } from './billing'
import type { PaidPlanId } from './stores'

let client: Stripe | null = null

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY

/** Cliente perezoso: no falla al compilar aunque falte la llave. */
export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY no está configurada en el entorno')
  client = new Stripe(key, { appInfo: { name: 'Matices CRM' }, maxNetworkRetries: 2 })
  return client
}

// ── Precios (leídos de Stripe por lookup key, con caché en memoria) ─────────
type PriceInfo = { id: string; plan: PaidPlanId; price: PlanPrice }
let priceCache: { at: number; list: PriceInfo[] } | null = null
const PRICE_TTL = 10 * 60 * 1000

export async function getPlanPrices(): Promise<PriceInfo[]> {
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL) return priceCache.list
  const res = await getStripe().prices.list({ lookup_keys: Object.values(PRICE_LOOKUP), active: true, limit: 10 })
  const list: PriceInfo[] = []
  for (const p of res.data) {
    const plan = planFromLookupKey(p.lookup_key)
    if (!plan || p.unit_amount === null) continue
    list.push({ id: p.id, plan, price: { amount: p.unit_amount / 100, currency: p.currency, interval: p.recurring?.interval ?? 'month' } })
  }
  priceCache = { at: Date.now(), list }
  return list
}

export async function priceIdFor(plan: PaidPlanId): Promise<string | null> {
  return (await getPlanPrices()).find(p => p.plan === plan)?.id ?? null
}
