import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { getServerSupabase, type StoreContext } from './supabase-server'
import { getStripe, priceIdFor } from './stripe'
import { assertStripeStoreLock, withStripeStoreLock } from './stripeBillingState'
import type { PaidPlanId } from './stores'

export class CheckoutConflict extends Error {}

type Attempt = {
  checkout_attempt: string | null
  checkout_params: Stripe.Checkout.SessionCreateParams | null
  checkout_session: string | null
}

const terminal = (status: string) => status === 'canceled' || status === 'incomplete_expired'

/** Persisted attempts survive timeouts, lost responses and server restarts. */
export async function openStripeCheckout(ctx: StoreContext, plan: PaidPlanId, origin: string): Promise<string> {
  return withStripeStoreLock(ctx.storeId, async token => {
    const db = getServerSupabase()
    const stripe = getStripe()
    const { data: store, error: storeError } = await db.from('stores')
      .select('stripe_customer_id, plan, status').eq('id', ctx.storeId).single()
    if (storeError) throw storeError
    if (store.plan === 'interno' || ['suspended', 'cancelled'].includes(store.status)) {
      throw new CheckoutConflict('Tu tienda no puede iniciar una suscripción en este momento.')
    }

    let customer: string = store.stripe_customer_id
    if (!customer) {
      await assertStripeStoreLock(ctx.storeId, token)
      // Stable parameters even if the store name or owner's email changes
      // between attempts. No personal data is needed to associate the customer.
      const created = await stripe.customers.create({ metadata: { store_id: ctx.storeId } },
        { idempotencyKey: `customer-v2-${ctx.storeId}` })
      const { data: saved, error } = await db.rpc('bind_stripe_customer', {
        p_store: ctx.storeId, p_token: token, p_customer: created.id,
      })
      if (error) throw error
      // The RPC returns the actual winner of the conditional assignment.
      if (!saved) throw new Error('No se guardó el cliente de Stripe')
      customer = saved as string
    }

    // Consult Stripe as well as local state: the payment webhook may be delayed.
    // Unpaid, paused and incomplete subscriptions must be managed, not duplicated.
    async function ensureNoSubscription() {
      let count = 0
      for await (const sub of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
        if (!terminal(sub.status)) throw new CheckoutConflict('Ya tienes una suscripción. Usa "Administrar suscripción".')
        if (++count >= 1000) throw new Error('Demasiadas suscripciones para verificar el cliente')
      }
    }
    await ensureNoSubscription()

    const { data: state, error: stateError } = await db.from('stripe_billing_state')
      .select('checkout_attempt, checkout_params, checkout_session').eq('store_id', ctx.storeId).single()
    if (stateError) throw stateError
    let attempt = state as Attempt

    async function save(a: Attempt, clear = false) {
      const { error } = await db.rpc('save_stripe_checkout', {
        p_store: ctx.storeId, p_token: token, p_attempt: a.checkout_attempt,
        p_params: a.checkout_params, p_session: a.checkout_session, p_clear: clear,
      })
      if (error) throw error
    }

    let session: Stripe.Checkout.Session | null = null
    if (attempt.checkout_attempt && attempt.checkout_params) {
      if (attempt.checkout_session) {
        session = await stripe.checkout.sessions.retrieve(attempt.checkout_session)
      } else if ((attempt.checkout_params.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 30 * 60 + 60) {
        // A response may have been lost after Stripe created the session. Never
        // rotate the key until we have reconciled that attempt with Stripe.
        const sessions = await stripe.checkout.sessions.list({
          customer, created: { gte: (attempt.checkout_params.expires_at ?? 0) - 3600 }, limit: 100,
        })
        if (sessions.has_more) throw new Error('No se pudo reconciliar el intento de pago')
        session = sessions.data.find(s => s.metadata?.checkout_attempt === attempt.checkout_attempt) ?? null
        if (!session && (attempt.checkout_params.expires_at ?? 0) > Math.floor(Date.now() / 1000)) {
          // Stripe requires expires_at to be at least 30 minutes in the future
          // for a fresh create. Do not change the persisted payload to retry it.
          throw new Error('El intento anterior aún está pendiente. Intenta de nuevo más tarde.')
        }
        if (!session) {
          // The persisted expires_at also prevents an old worker from creating
          // a payable session after this attempt has been cleared.
          await save(attempt, true)
          attempt = { checkout_attempt: null, checkout_params: null, checkout_session: null }
        } else {
          attempt.checkout_session = session.id
          await save(attempt)
        }
      } else {
        await assertStripeStoreLock(ctx.storeId, token)
        session = await stripe.checkout.sessions.create(attempt.checkout_params,
          { idempotencyKey: `checkout-${attempt.checkout_attempt}` })
        attempt.checkout_session = session.id
        await save(attempt)
        session = await stripe.checkout.sessions.retrieve(session.id)
      }
    }

    if (session) {
      const sessionCustomer = typeof session.customer === 'string' ? session.customer : session.customer?.id
      if (sessionCustomer !== customer || session.mode !== 'subscription') throw new Error('Sesión de pago incompatible')
      if (session.status === 'complete') {
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (!subId || !terminal((await stripe.subscriptions.retrieve(subId)).status)) {
          throw new CheckoutConflict('Tu pago ya fue recibido. Espera a que se actualice tu plan.')
        }
      } else if (session.status === 'open') {
        if (session.metadata?.plan === plan && session.url) {
          await assertStripeStoreLock(ctx.storeId, token)
          return session.url
        }
        // Changing plans invalidates the previous link before opening another.
        await assertStripeStoreLock(ctx.storeId, token)
        await stripe.checkout.sessions.expire(session.id)
      } else if (session.status !== 'expired') {
        throw new Error('Estado de Checkout desconocido')
      }
      await save(attempt, true)
    }

    // Invalidate open links issued by the previous implementation as well.
    const legacy = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100 })
    if (legacy.has_more) throw new Error('Demasiadas sesiones de pago pendientes')
    for (const old of legacy.data) {
      if (old.mode !== 'subscription') continue
      if (old.metadata?.store_id !== ctx.storeId) throw new Error('Sesión pendiente sin tienda reconocida')
      await assertStripeStoreLock(ctx.storeId, token)
      await stripe.checkout.sessions.expire(old.id)
    }
    // A user could have completed a legacy link between the first subscription
    // check and the session listing. Recheck after all payable links are closed.
    await ensureNoSubscription()

    const price = await priceIdFor(plan)
    if (!price) throw new Error('Este plan aún no tiene precio configurado')
    const id = randomUUID()
    const params: Stripe.Checkout.SessionCreateParams = {
      ui_mode: 'hosted_page', mode: 'subscription', customer,
      customer_update: { address: 'auto' }, client_reference_id: ctx.storeId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { store_id: ctx.storeId, plan } },
      metadata: { store_id: ctx.storeId, plan, checkout_attempt: id },
      billing_address_collection: 'auto', phone_number_collection: { enabled: false },
      automatic_tax: { enabled: true }, allow_promotion_codes: false,
      payment_method_collection: 'always', submit_type: 'auto',
      integration_identifier: 'hosted_mobile_app_0002', origin_context: 'mobile_app',
      success_url: `${origin}/configuracion?tab=plan&pago=ok`,
      cancel_url: `${origin}/configuracion?tab=plan`,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }
    attempt = { checkout_attempt: id, checkout_params: params, checkout_session: null }
    await save(attempt)
    await assertStripeStoreLock(ctx.storeId, token)
    session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout-${id}` })
    attempt.checkout_session = session.id
    await save(attempt)
    if (!session.url) throw new Error('Stripe no devolvió la URL del pago')
    return session.url
  })
}
