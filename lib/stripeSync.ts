/**
 * Sincroniza una suscripción de Stripe con su tienda (solo servidor; lo usa
 * el webhook). Siempre vuelve a leer la suscripción en Stripe en lugar de
 * confiar en el evento, para que el orden en que lleguen los avisos no
 * importe; la escritura la hace la función atómica apply_stripe_subscription.
 */
import { getServerSupabase } from './supabase-server'
import { getStripe } from './stripe'
import { subscriptionSnapshot, type SubscriptionLike } from './billing'
import { PLANS } from './stores'
import { APP_NAME } from './brand'

export type SyncResult =
  | { ok: true; storeId: string; plan: string; prevPlan: string }
  | { ok: false; reason: string }

/** Tienda de la suscripción: por metadata (validando el cliente) o por su cliente de Stripe. */
async function storeFor(storeId: string | null, customerId: string): Promise<string | null> {
  const db = getServerSupabase()
  if (storeId && /^[0-9a-f-]{36}$/i.test(storeId)) {
    const { data } = await db.from('stores').select('id, stripe_customer_id').eq('id', storeId).maybeSingle()
    if (data && (!data.stripe_customer_id || data.stripe_customer_id === customerId)) return data.id as string
  }
  const { data } = await db.from('stores').select('id').eq('stripe_customer_id', customerId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export async function syncSubscription(subscriptionId: string): Promise<SyncResult> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId)
  const snap = subscriptionSnapshot(sub as unknown as SubscriptionLike)
  const storeId = await storeFor(snap.storeId, snap.customerId)
  if (!storeId) return { ok: false, reason: `Suscripción ${snap.subscriptionId} sin tienda` }

  const { data, error } = await getServerSupabase().rpc('apply_stripe_subscription', {
    p_store: storeId,
    p_customer: snap.customerId,
    p_subscription: snap.subscriptionId,
    p_status: snap.status,
    p_plan: snap.plan,
    p_period_end: snap.periodEnd,
    p_cancel_at_period_end: snap.cancelAtPeriodEnd,
    p_plans: PLANS,
  })
  if (error) throw error
  if (data?.ignored) return { ok: false, reason: 'Suscripción anterior ignorada' }
  return { ok: true, storeId, plan: data?.plan, prevPlan: data?.prev_plan }
}

/** Aviso al celular del dueño de la tienda (cobro fallido o que requiere su confirmación). */
export async function notifyStoreOwner(storeId: string, body: string): Promise<void> {
  const { configureWebPush, sendPushToSubscriptions } = await import('./push')
  if (!configureWebPush()) return
  const db = getServerSupabase()
  const { data: owners } = await db.from('store_members').select('user_id').eq('store_id', storeId).eq('role', 'owner').eq('status', 'active')
  const ids = (owners ?? []).map(o => o.user_id as string)
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
