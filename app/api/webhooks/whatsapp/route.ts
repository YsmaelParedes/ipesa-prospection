import { NextRequest, NextResponse, after } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getServerSupabase } from '@/lib/supabase-server'
import { friendlyWhatsAppError, verifyWebhookSignature } from '@/lib/whatsapp'
import { fmtPhone, normalizePhone, phoneVariants } from '@/lib/phone'
import { isOptOutMessage } from '@/lib/whatsappSafety'
import { configureWebPush, sendPushToSubscriptions } from '@/lib/push'

export const dynamic = 'force-dynamic'

/**
 * GET — verificación del webhook (Meta la llama una sola vez al guardar la
 * configuración en el panel de desarrolladores).
 */
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token') ?? ''
  const challenge = req.nextUrl.searchParams.get('hub.challenge') ?? ''
  const expected  = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? ''

  const valid = mode === 'subscribe' && !!expected && token.length === expected.length
    && timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  if (valid && /^[\w-]{1,128}$/.test(challenge)) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verificación fallida' }, { status: 403 })
}

type Inbound = { text: string; mediaId?: string; mediaType?: string; mime?: string; optOutCandidate?: string }

const MEDIA_LABELS: Record<string, string> = {
  image: '📷 Imagen', audio: '🎤 Audio', video: '🎥 Video', document: '📄 Documento', sticker: '🏷️ Sticker',
}

/** Convierte cualquier tipo de mensaje entrante en texto legible + referencia multimedia. */
function parseInbound(msg: any): Inbound | null {
  switch (msg.type) {
    case 'text':
      return { text: msg.text?.body ?? '', optOutCandidate: msg.text?.body }
    case 'button':
      return { text: `👉 ${msg.button?.text ?? ''}`, optOutCandidate: msg.button?.text }
    case 'interactive': {
      const title = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title
      return { text: title ? `👉 ${title}` : '[respuesta interactiva]', optOutCandidate: title }
    }
    case 'image': case 'audio': case 'video': case 'document': case 'sticker': {
      const media = msg[msg.type] ?? {}
      const caption = media.caption || (msg.type === 'document' ? media.filename : '')
      return {
        text: caption ? `${MEDIA_LABELS[msg.type]} · ${caption}` : MEDIA_LABELS[msg.type],
        mediaId: media.id, mediaType: msg.type, mime: media.mime_type,
      }
    }
    case 'location': {
      const { latitude, longitude, name, address } = msg.location ?? {}
      const label = [name, address].filter(Boolean).join(' — ')
      return { text: `📍 ${label || 'Ubicación'}${latitude && longitude ? `\nhttps://maps.google.com/?q=${latitude},${longitude}` : ''}` }
    }
    case 'contacts': {
      const c = msg.contacts?.[0]
      return { text: `👤 Contacto compartido: ${c?.name?.formatted_name ?? ''} ${c?.phones?.[0]?.phone ?? ''}`.trim() }
    }
    case 'reaction':
      // Quitar una reacción llega con emoji vacío: no hace falta guardarlo
      return msg.reaction?.emoji ? { text: `Reaccionó ${msg.reaction.emoji}` } : null
    case 'system':
      return null
    default:
      return { text: `[${msg.type ?? 'mensaje'}]` }
  }
}

// Los estados llegan fuera de orden con frecuencia ("delivered" después de
// "read"): solo se avanza, nunca se retrocede.
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 }
const LOWER_THAN = (status: string) => Object.keys(STATUS_RANK).filter(s => STATUS_RANK[s] < STATUS_RANK[status])

let warnedMissingSecret = false

/**
 * POST — eventos de WhatsApp Cloud API: estados de mensajes salientes
 * (sent/delivered/read/failed) y mensajes entrantes de contactos.
 * Responde 200 rápido (Meta reintenta si no); las notificaciones push se
 * mandan después de responder con after().
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

  const supabase = getServerSupabase()
  const notifications: { phone: string; title: string; text: string }[] = []

  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {}

        // ── Estados de mensajes salientes ──
        for (const status of value.statuses ?? []) {
          if (typeof status?.id !== 'string') continue
          const now = new Date().toISOString()
          if (status.status === 'failed') {
            const err = status.errors?.[0]
            await supabase.from('whatsapp_messages').update({
              status: 'failed',
              error_message: friendlyWhatsAppError(err?.code, err?.error_data?.details || err?.title || err?.message || 'Error de entrega'),
              updated_at: now,
            }).eq('wa_message_id', status.id)
          } else if (STATUS_RANK[status.status]) {
            await supabase.from('whatsapp_messages')
              .update({ status: status.status, updated_at: now })
              .eq('wa_message_id', status.id)
              .in('status', LOWER_THAN(status.status))
          }
        }

        // ── Mensajes entrantes ──
        const profileByWaId = new Map<string, string>(
          (value.contacts ?? []).map((c: any) => [String(c?.wa_id ?? ''), String(c?.profile?.name ?? '')]),
        )

        for (const msg of value.messages ?? []) {
          const phone = normalizePhone(msg?.from)
          const parsed = parseInbound(msg)
          if (!phone || !parsed || typeof msg?.id !== 'string') continue

          const { data: contact } = await supabase
            .from('contacts')
            .select('id, name')
            .in('phone', phoneVariants(phone))
            .limit(1)
            .maybeSingle()

          const profileName = profileByWaId.get(String(msg.from)) || null
          const { error } = await supabase.from('whatsapp_messages').insert([{
            contact_id:    contact?.id ?? null,
            phone,
            direction:     'inbound',
            body:          parsed.text.slice(0, 4096),
            wa_message_id: msg.id,
            status:        'received',
            media_id:      parsed.mediaId ?? null,
            media_type:    parsed.mediaType ?? null,
            media_mime:    parsed.mime ?? null,
            profile_name:  profileName,
            created_at:    msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : undefined,
          }])
          // 23505 = Meta reintentó un mensaje que ya guardamos
          if (error) {
            if (error.code !== '23505') console.error('[webhook/whatsapp] insert:', error.message)
            continue
          }

          // "BAJA" / "STOP" / botón "Detener promociones" → no más campañas
          if (contact && parsed.optOutCandidate && isOptOutMessage(parsed.optOutCandidate)) {
            await supabase.from('contacts')
              .update({ wa_opt_out: true, wa_opt_out_at: new Date().toISOString() })
              .eq('id', contact.id)
          }

          notifications.push({ phone, title: contact?.name || profileName || fmtPhone(phone), text: parsed.text })
        }
      }
    }
  } catch (error: any) {
    // Igual responder 200: un 500 solo haría que Meta reintente el mismo lote.
    console.error('[POST /api/webhooks/whatsapp]', error?.message ?? error)
  }

  if (notifications.length) after(() => notifyTeam(notifications))
  return NextResponse.json({ received: true })
}

/** Push a los dispositivos del equipo que tienen activados los avisos de WhatsApp. */
async function notifyTeam(items: { phone: string; title: string; text: string }[]) {
  if (!configureWebPush()) return
  const { data: subs } = await getServerSupabase()
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('notify_whatsapp', true)
  if (!subs?.length) return

  // Un aviso por conversación (el último mensaje), no uno por mensaje.
  const latest = new Map(items.map(i => [i.phone, i]))
  for (const item of latest.values()) {
    await sendPushToSubscriptions(subs, {
      title: `💬 ${item.title}`,
      body:  item.text.length > 140 ? `${item.text.slice(0, 137)}…` : item.text,
      url:   `/whatsapp?phone=${item.phone}`,
      tag:   `wa-${item.phone}`,
    })
  }
}
