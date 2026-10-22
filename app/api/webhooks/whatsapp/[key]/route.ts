import { NextRequest, NextResponse, after } from 'next/server'
import { readBoundedBody } from '@/lib/boundedBody'
import { verifyWebhookSignature } from '@/lib/whatsapp'
import { credsFromRow, findStoreByWebhookKey } from '@/lib/storeWhatsApp'
import { notifyStoreTeam, processChange, verifyTokenMatches, type InboundNotification } from '@/lib/whatsappWebhook'
import { reportError } from '@/lib/errorReport'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ key: string }> }

/**
 * Webhook propio de cada tienda: /api/webhooks/whatsapp/<webhook_key>.
 * La tienda lo registra en SU app de Meta con SU token de verificación, y
 * cada POST se valida con SU app secret. Solo se aceptan eventos de su número.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const row = await findStoreByWebhookKey((await params).key)
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token') ?? ''
  const challenge = req.nextUrl.searchParams.get('hub.challenge') ?? ''
  const valid = !!row && row.credentials_source === 'store' && mode === 'subscribe' && verifyTokenMatches(token, row.verify_token)
  if (valid && /^[\w-]{1,128}$/.test(challenge)) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verificación fallida' }, { status: 403 })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const bytes = await readBoundedBody(req.body, 1024 * 1024)
  if (!bytes) return NextResponse.json({ error: 'Evento demasiado grande' }, { status: 413 })
  const raw = new TextDecoder().decode(bytes)
  const row = await findStoreByWebhookKey((await params).key)
  if (!row || row.credentials_source !== 'store') return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Sin app secret no hay forma de saber que el evento viene de Meta: se rechaza.
  const appSecret = credsFromRow(row)?.appSecret
  if (!appSecret || !verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ received: true }) }

  const items: InboundNotification[] = []
  let failed = false
  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {}
        // Solo eventos del número conectado a esta tienda
        // "messaging_handovers" trae el número en `recipient`, no en `metadata`
        if (String(value?.metadata?.phone_number_id ?? value?.recipient?.phone_number_id ?? '') !== row.phone_number_id) continue
        items.push(...await processChange(row.store_id, value))
      }
    }
  } catch (error: any) {
    failed = true
    console.error('[POST /api/webhooks/whatsapp/[key]]', error?.message ?? error)
    reportError({ source: 'webhook', context: 'webhook/whatsapp/tienda', error, storeId: row.store_id })
  }

  if (items.length) after(() => notifyStoreTeam(row.store_id, items))
  // 500 = Meta reintenta; guardar es idempotente por wa_message_id
  if (failed) return NextResponse.json({ error: 'No se pudo procesar' }, { status: 500 })
  return NextResponse.json({ received: true })
}
