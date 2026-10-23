import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { stripeConfigured } from '@/lib/stripe'
import { CheckoutConflict, openStripeCheckout } from '@/lib/stripeCheckout'
import { isPaidPlanId, subscriptionGivesPlan } from '@/lib/billing'
import { siteOrigin } from '@/lib/invitations'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { jsonError, readJson, serverError } from '@/lib/validation'

/**
 * POST /api/billing/checkout { plan: 'galon' | 'cubeta' } — administradores.
 * Abre el pago de Stripe (Checkout en modo suscripción) y devuelve su URL.
 * El plan de la tienda NO cambia aquí: lo cambia el webhook cuando Stripe
 * confirma la suscripción. Si ya paga una suscripción, el cambio de plan se
 * hace en el portal de Stripe (POST /api/billing/portal).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
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
    const url = await openStripeCheckout(ctx, plan, siteOrigin(req.nextUrl.origin))
    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof CheckoutConflict) return jsonError(error.message, 409)
    return serverError('POST /api/billing/checkout', error, 'No se pudo abrir el pago. Intenta de nuevo.')
  }
}
