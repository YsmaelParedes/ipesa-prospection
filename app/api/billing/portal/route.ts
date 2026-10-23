import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { getStripe, stripeConfigured } from '@/lib/stripe'
import { siteOrigin } from '@/lib/invitations'
import { jsonError, serverError } from '@/lib/validation'

/**
 * POST /api/billing/portal — administradores. Abre el portal de Stripe para
 * cambiar de plan, cancelar al final del periodo, cambiar la tarjeta o
 * descargar facturas. Se permite aunque la tienda esté en solo lectura.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  if (!stripeConfigured()) return jsonError('El pago con tarjeta estará disponible pronto.', 503)
  if (!ctx.store.stripe_customer_id) return jsonError('Tu tienda aún no tiene una suscripción.', 409)

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: ctx.store.stripe_customer_id,
      locale: 'es-419',
      return_url: `${siteOrigin(req.nextUrl.origin)}/configuracion?tab=plan`,
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    return serverError('POST /api/billing/portal', error, 'No se pudo abrir el portal. Intenta de nuevo.')
  }
}
