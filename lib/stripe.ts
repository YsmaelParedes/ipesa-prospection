/**
 * Cliente de Stripe (solo servidor). Las llaves viven en variables de entorno:
 *   STRIPE_SECRET_KEY      llave secreta (sk_test_… en pruebas, sk_live_… en producción)
 *   STRIPE_WEBHOOK_SECRET  secreto de firma del webhook (whsec_…)
 * Sin STRIPE_SECRET_KEY el cobro queda "Disponible pronto" y nada se rompe.
 */
import Stripe from 'stripe'
import { PRICE_LOOKUP, planFromLookupKey, type PlanPrice } from './billing'
import type { PaidPlanId } from './stores'
import { getServerSupabase } from './supabase-server'

let client: Stripe | null = null

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY

/** Cliente perezoso: no falla al compilar aunque falte la llave. */
export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY no está configurada en el entorno')
  client = new Stripe(key, { appInfo: { name: 'Matices CRM' }, maxNetworkRetries: 2, timeout: 20_000 })
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
    if (!plan || p.unit_amount === null || p.recurring?.interval !== 'month' || p.recurring.interval_count !== 1) continue
    await rememberPricePlan(p.id, plan)
    list.push({ id: p.id, plan, price: { amount: p.unit_amount / 100, currency: p.currency, interval: p.recurring?.interval ?? 'month' } })
  }
  priceCache = { at: Date.now(), list }
  return list
}

export async function priceIdFor(plan: PaidPlanId): Promise<string | null> {
  return (await getPlanPrices()).find(p => p.plan === plan)?.id ?? null
}

/** Immutable history: moving a lookup key must not change an old price's plan. */
export async function rememberPricePlan(priceId: string, plan: PaidPlanId): Promise<void> {
  const db = getServerSupabase()
  const { error } = await db.from('stripe_price_plans').upsert(
    { price_id: priceId, plan }, { onConflict: 'price_id', ignoreDuplicates: true },
  )
  if (error) throw error
  const { data, error: readError } = await db.from('stripe_price_plans').select('plan').eq('price_id', priceId).single()
  if (readError) throw readError
  if (data.plan !== plan) throw new Error('El precio de Stripe ya pertenece a otro plan')
}

export async function planForPrice(price: Stripe.Price): Promise<PaidPlanId | null> {
  const { data, error } = await getServerSupabase().from('stripe_price_plans')
    .select('plan').eq('price_id', price.id).maybeSingle()
  if (error) throw error
  if (data) return data.plan as PaidPlanId
  const plan = planFromLookupKey(price.lookup_key)
  if (plan) await rememberPricePlan(price.id, plan)
  return plan
}
