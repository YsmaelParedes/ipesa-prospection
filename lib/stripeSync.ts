/**
 * Sincroniza una suscripción de Stripe con su tienda (solo servidor; lo usa
 * el webhook). Siempre vuelve a leer la suscripción en Stripe en lugar de
 * confiar en el evento, para que el orden en que lleguen los avisos no
 * importe; la escritura la hace la función atómica apply_stripe_subscription.
 */
import { getServerSupabase } from './supabase-server'
import { getStripe, planForPrice } from './stripe'
import { subscriptionSnapshot, type SubscriptionLike } from './billing'
import { PLANS } from './stores'
import { APP_NAME } from './brand'
import { withStripeStoreLock } from './stripeBillingState'

/** La suscripción no es de ninguna tienda de Matices (otro producto de la misma cuenta de Stripe). */
export const NOT_A_STORE = 'Suscripción sin tienda'

export type SyncResult =
  | { ok: true; storeId: string; plan: string; prevPlan: string }
  | { ok: false; reason: string }

/** Tienda de la suscripción: por metadata (validando el cliente) o por su cliente de Stripe. */
async function storeFor(storeId: string | null, customerId: string): Promise<string | null> {
  const db = getServerSupabase()
  if (storeId && /^[0-9a-f-]{36}$/i.test(storeId)) {
    const { data, error } = await db.from('stores').select('id, stripe_customer_id').eq('id', storeId).maybeSingle()
    if (error) throw error
    if (data && (!data.stripe_customer_id || data.stripe_customer_id === customerId)) return data.id as string
  }
  const { data, error } = await db.from('stores').select('id').eq('stripe_customer_id', customerId).maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

export async function syncSubscription(subscriptionId: string): Promise<SyncResult> {
  const stripe = getStripe()
  // The first read only identifies the store. Never apply this snapshot.
  const initial = subscriptionSnapshot(await stripe.subscriptions.retrieve(subscriptionId) as unknown as SubscriptionLike)
  const storeId = await storeFor(initial.storeId, initial.customerId)
  // No se reintenta: la cuenta de Stripe puede tener otros productos que no son de Matices
  if (!storeId) return { ok: false, reason: NOT_A_STORE }

  return withStripeStoreLock(storeId, async token => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    const snap = subscriptionSnapshot(sub as unknown as SubscriptionLike)
    if (snap.customerId !== initial.customerId) throw new Error('El cliente de la suscripción cambió')
    // Resolve historical price IDs as well as today's lookup keys. Never use
    // subscription metadata.plan: the portal may have changed the price.
    const plans = new Set<string>()
    for (const item of sub.items.data) {
      const plan = await planForPrice(item.price)
      if (plan) plans.add(plan)
    }
    if (plans.size > 1) throw new Error('Suscripción con varios planes de Matices')
    snap.plan = (plans.values().next().value as typeof snap.plan) ?? null

    const { data, error } = await getServerSupabase().rpc('apply_stripe_subscription', {
      p_store: storeId,
      p_customer: snap.customerId,
      p_subscription: snap.subscriptionId,
      p_status: snap.status,
      p_plan: snap.plan,
      p_period_end: snap.periodEnd,
      p_cancel_at_period_end: snap.cancelAtPeriodEnd,
      p_plans: PLANS,
      p_lock: token,
    })
    if (error) throw error
    if (data?.ignored) return { ok: false, reason: 'Suscripción anterior ignorada' }
    if (!data?.plan || !data?.prev_plan) throw new Error('Stripe no devolvió el resultado de sincronización')
    return { ok: true, storeId, plan: data.plan, prevPlan: data.prev_plan }
  })
}

/** Aviso al celular de los administradores de la tienda (cobro fallido o que requiere su confirmación). */
export async function notifyStoreAdmins(storeId: string, body: string): Promise<void> {
  const { configureWebPush, sendPushToSubscriptions } = await import('./push')
  if (!configureWebPush()) return
  const db = getServerSupabase()
  const { data: admins } = await db.from('store_members').select('user_id').eq('store_id', storeId).eq('role', 'admin').eq('status', 'active')
  const ids = (admins ?? []).map(o => o.user_id as string)
  if (!ids.length) return
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
  if (!subs?.length) return
  await sendPushToSubscriptions(subs, {
    title: `Tu plan de ${APP_NAME}`,
    body,
    url: '/configuracion?tab=plan',
    tag: `billing-${storeId.slice(0, 8)}`,
    renotify: true,
  }, { urgency: 'high', ttl: 24 * 60 * 60 })
}
