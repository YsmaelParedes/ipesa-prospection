import { NextRequest, NextResponse, after } from 'next/server'
import { verifyWebhookSignature } from '@/lib/whatsapp'
import { findStoreByPhoneNumberId } from '@/lib/storeWhatsApp'
import { notifyStoreTeam, processChange, verifyTokenMatches, type InboundNotification } from '@/lib/whatsappWebhook'

export const dynamic = 'force-dynamic'

/**
 * Webhook ORIGINAL (app de Meta configurada en las variables de entorno del
 * servidor). Cada evento se enruta a la tienda dueña del número
 * (metadata.phone_number_id). Las tiendas que conectan su propia app de Meta
 * usan /api/webhooks/whatsapp/[key], verificado con SU app secret.
 */

// GET — verificación del webhook (Meta la llama al guardar la configuración)
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token') ?? ''
  const challenge = req.nextUrl.searchParams.get('hub.challenge') ?? ''
  const valid = mode === 'subscribe' && verifyTokenMatches(token, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '')
  if (valid && /^[\w-]{1,128}$/.test(challenge)) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verificación fallida' }, { status: 403 })
}

let warnedMissingSecret = false

/**
 * POST — estados de mensajes salientes y mensajes entrantes. Responde 200
 * rápido (Meta reintenta si no); las notificaciones push van con after().
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()

  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'), appSecret)) {
      console.warn('[webhook/whatsapp] firma inválida — petición rechazada')
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }
  } else if (!warnedMissingSecret) {
    warnedMissingSecret = true
    console.warn('[webhook/whatsapp] WHATSAPP_APP_SECRET no configurado: la firma del webhook NO se está verificando')
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ received: true }) }

  const pending: { storeId: string; items: InboundNotification[] }[] = []
  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {}
        const phoneNumberId = String(value?.metadata?.phone_number_id ?? '')
        if (!/^\d{5,30}$/.test(phoneNumberId)) continue
        const store = await findStoreByPhoneNumberId(phoneNumberId)
        if (!store) {
          console.warn('[webhook/whatsapp] número sin tienda asignada:', phoneNumberId)
          continue
        }
        pending.push({ storeId: store.store_id, items: await processChange(store.store_id, value) })
      }
    }
  } catch (error: any) {
    // Igual responder 200: un 500 solo haría que Meta reintente el mismo lote.
    console.error('[POST /api/webhooks/whatsapp]', error?.message ?? error)
  }

  if (pending.some(p => p.items.length)) after(() => Promise.all(pending.map(p => notifyStoreTeam(p.storeId, p.items))))
  return NextResponse.json({ received: true })
}
