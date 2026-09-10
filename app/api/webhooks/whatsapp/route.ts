import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { normalizeWhatsAppPhone } from '@/lib/whatsapp'

/**
 * GET — verificación del webhook (Meta la llama una sola vez al guardar la
 * configuración en el panel de desarrolladores).
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verificación fallida' }, { status: 403 })
}

/**
 * Extrae un texto legible del mensaje entrante sin importar el tipo:
 * texto libre, tap a un botón de respuesta rápida de una plantilla, o
 * respuesta interactiva (lista/botones). Cae a una etiqueta genérica
 * solo si es un tipo que de plano no trae texto (imagen, audio, etc.).
 */
function extractMessageText(msg: any): string {
  if (msg.text?.body) return msg.text.body
  if (msg.type === 'button' && msg.button?.text) return `👉 ${msg.button.text}`
  if (msg.type === 'interactive') {
    const title = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
    if (title) return `👉 ${title}`
  }
  const LABELS: Record<string, string> = {
    image: '📷 Imagen', audio: '🎤 Audio', video: '🎥 Video',
    document: '📄 Documento', sticker: '🏷️ Sticker', location: '📍 Ubicación',
  }
  return LABELS[msg.type] ?? `[${msg.type}]`
}

/**
 * POST — eventos entrantes de WhatsApp Cloud API: estados de mensajes salientes
 * (sent/delivered/read/failed) y mensajes entrantes de contactos.
 * Siempre responde 200 rápido — Meta reintenta agresivamente si no recibe 200.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = getServerSupabase()

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}

        // Estados de mensajes salientes que nosotros enviamos
        for (const status of value.statuses ?? []) {
          const update: Record<string, unknown> = {
            status: status.status, // sent | delivered | read | failed
            updated_at: new Date().toISOString(),
          }
          if (status.errors?.[0]) {
            update.error_message = status.errors[0].title ?? status.errors[0].message ?? ''
          }
          await supabase.from('whatsapp_messages').update(update).eq('wa_message_id', status.id)
        }

        // Mensajes entrantes (respuestas de contactos) — se guardan para la bandeja de entrada
        for (const msg of value.messages ?? []) {
          const phone = normalizeWhatsAppPhone(msg.from)
          const bodyText = extractMessageText(msg)

          const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('phone', phone)
            .maybeSingle()

          await supabase.from('whatsapp_messages').insert([{
            contact_id: contact?.id ?? null,
            phone,
            direction: 'inbound',
            body: bodyText,
            wa_message_id: msg.id,
            status: 'received',
          }])
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[POST /api/webhooks/whatsapp]', error?.message ?? error)
    return NextResponse.json({ received: true })
  }
}
