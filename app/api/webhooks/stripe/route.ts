import { NextRequest, NextResponse, after } from 'next/server'
import type Stripe from 'stripe'
import { readBoundedBody } from '@/lib/boundedBody'
import { getServerSupabase } from '@/lib/supabase-server'
import { getStripe } from '@/lib/stripe'
import { notifyStoreOwner, syncSubscription } from '@/lib/stripeSync'
import { reportError } from '@/lib/errorReport'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/stripe — avisos de Stripe (suscripciones y cobros).
 *  · Firma verificada con STRIPE_WEBHOOK_SECRET sobre el cuerpo crudo; sin
 *    el secreto se rechaza todo (falla cerrado).
 *  · Cada evento se procesa una sola vez (tabla stripe_events).
 *  · El plan de la tienda solo lo cambia syncSubscription, que vuelve a leer
 *    la suscripción en Stripe.
 *  · Si algo falla responde 500 para que Stripe lo reintente.
 * Eventos a suscribir en Stripe: checkout.session.completed,
 * customer.subscription.created/updated/deleted, invoice.paid,
 * invoice.payment_failed, invoice.payment_action_required,
 * charge.dispute.created, radar.early_fraud_warning.created.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    reportError({ source: 'webhook', context: 'webhook/stripe', error: new Error('Stripe no está configurado: se rechazan los avisos') })
    return NextResponse.json({ error: 'Webhook sin configurar' }, { status: 503 })
  }
  const bytes = await readBoundedBody(req.body, 512 * 1024)
  if (!bytes) return NextResponse.json({ error: 'Evento demasiado grande' }, { status: 413 })
  const raw = new TextDecoder().decode(bytes)

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', secret)
  } catch {
    console.warn('[webhook/stripe] firma inválida — petición rechazada')
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 })
  }

  const db = getServerSupabase()
  try {
    await db.from('stripe_events').upsert({ id: event.id, type: event.type }, { onConflict: 'id', ignoreDuplicates: true })
    const { data: seen, error: seenError } = await db.from('stripe_events').select('processed_at').eq('id', event.id).maybeSingle()
    if (seenError) throw seenError
    if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true })

    await handleEvent(event)

    const { error } = await db.from('stripe_events').update({ processed_at: new Date().toISOString() }).eq('id', event.id)
    if (error) throw error
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[POST /api/webhooks/stripe]', event.type, error instanceof Error ? error.message : error)
    reportError({ source: 'webhook', context: `webhook/stripe ${event.type}`, error })
    return NextResponse.json({ error: 'No se pudo procesar' }, { status: 500 })
  }
}

/** Suscripción de una factura (en la API actual vive en invoice.parent.subscription_details). */
function invoiceSubscription(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  return typeof sub === 'string' ? sub : sub?.id ?? null
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription' || !session.subscription) return
      await syncOrReport(typeof session.subscription === 'string' ? session.subscription : session.subscription.id, event.type)
      return
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncOrReport(event.data.object.id, event.type)
      return
    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required': {
      const invoice = event.data.object
      const subId = invoiceSubscription(invoice)
      if (!subId) return
      const result = await syncOrReport(subId, event.type)
      if (result?.ok && event.type !== 'invoice.paid') {
        const text = event.type === 'invoice.payment_failed'
          ? 'No pudimos cobrar tu plan. Actualiza tu tarjeta en Configuración → Plan para no perderlo.'
          : 'Tu banco pide confirmar el cobro de tu plan. Entra a Configuración → Plan para confirmarlo.'
        after(() => notifyStoreOwner(result.storeId, text))
      }
      return
    }
    case 'charge.dispute.created':
    case 'radar.early_fraud_warning.created': {
      // Te avisa a ti (dueño de la plataforma) para revisarlo en el panel de Stripe
      const what = event.type === 'charge.dispute.created' ? 'Contracargo abierto' : 'Alerta temprana de fraude'
      reportError({ source: 'webhook', context: 'stripe/riesgo', error: new Error(`${what}: revísalo en el panel de Stripe (${event.data.object.id})`) })
      return
    }
    default:
      return
  }
}

async function syncOrReport(subscriptionId: string, type: string) {
  const result = await syncSubscription(subscriptionId)
  if (!result.ok && result.reason !== 'Suscripción anterior ignorada') {
    reportError({ source: 'webhook', context: `webhook/stripe ${type}`, error: new Error(result.reason) })
  }
  return result
}
