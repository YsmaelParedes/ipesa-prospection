import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { getStripe, priceIdFor, stripeConfigured } from '@/lib/stripe'
import { isPaidPlanId, subscriptionGivesPlan } from '@/lib/billing'
import { siteOrigin } from '@/lib/invitations'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { jsonError, readJson, serverError } from '@/lib/validation'

/**
 * POST /api/billing/checkout { plan: 'galon' | 'cubeta' } — solo el dueño.
 * Abre el pago de Stripe (Checkout en modo suscripción) y devuelve su URL.
 * El plan de la tienda NO cambia aquí: lo cambia el webhook cuando Stripe
 * confirma la suscripción. Si ya paga una suscripción, el cambio de plan se
 * hace en el portal de Stripe (POST /api/billing/portal).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ owner: true, write: true })
  if (ctx instanceof Response) return ctx
  if (!stripeConfigured()) return jsonError('El pago con tarjeta estará disponible pronto.', 503)
  if (!rateLimit(`checkout:${ctx.storeId}:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return jsonError('Demasiados intentos. Espera unos minutos.', 429)
  }

  const body = await readJson(req)
  const plan = body?.plan
  if (!isPaidPlanId(plan)) return jsonError('Plan no válido')
  if (subscriptionGivesPlan(ctx.store.subscription_status)) {
    return jsonError('Ya tienes una suscripción. Cambia de plan desde "Administrar suscripción".', 409)
  }
  if (ctx.plan === 'interno') return jsonError('Tu tienda tiene un plan de cortesía; escríbenos para cambiarlo.', 409)

  try {
    const stripe = getStripe()
    const price = await priceIdFor(plan)
    if (!price) return jsonError('Este plan aún no tiene precio configurado. Intenta más tarde.', 503)

    // Un solo cliente de Stripe por tienda (la clave de idempotencia evita duplicados si se pide dos veces)
    let customer = ctx.store.stripe_customer_id
    if (!customer) {
      const created = await stripe.customers.create({
        name: ctx.store.name,
        email: ctx.user.email ?? undefined,
        metadata: { store_id: ctx.storeId },
      }, { idempotencyKey: `customer-${ctx.storeId}` })
      customer = created.id
      const { error } = await getServerSupabase().from('stores')
        .update({ stripe_customer_id: customer }).eq('id', ctx.storeId).is('stripe_customer_id', null)
      if (error) throw error
    }

    const origin = siteOrigin(req.nextUrl.origin)
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'hosted_page',
      mode: 'subscription',
      customer,
      // Necesario con automatic_tax y un cliente existente: Checkout guarda en él la dirección para calcular impuestos
      customer_update: { address: 'auto' },
      // Liga la suscripción con la tienda (lo usa el webhook); no quitar
      client_reference_id: ctx.storeId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { store_id: ctx.storeId, plan } },
      metadata: { store_id: ctx.storeId, plan },
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: true },
      allow_promotion_codes: false,
      payment_method_collection: 'always',
      submit_type: 'auto',
      integration_identifier: 'hosted_mobile_app_0002',
      origin_context: 'mobile_app',
      success_url: `${origin}/configuracion?tab=plan&pago=ok`,
      cancel_url: `${origin}/configuracion?tab=plan`,
    })
    if (!session.url) throw new Error('Stripe no devolvió la URL del pago')
    return NextResponse.json({ url: session.url })
  } catch (error) {
    return serverError('POST /api/billing/checkout', error, 'No se pudo abrir el pago. Intenta de nuevo.')
  }
}
