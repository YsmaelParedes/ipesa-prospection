/**
 * Procesa los eventos del webhook de WhatsApp Cloud API para UNA tienda:
 * estados de mensajes salientes y mensajes entrantes. Lo usan las dos
 * entradas del webhook (la URL original y la URL propia de cada tienda).
 */
import { timingSafeEqual } from 'node:crypto'
import { getServerSupabase } from './supabase-server'
import { friendlyWhatsAppError } from './whatsapp'
import { fmtPhone, normalizePhone, phoneVariants } from './phone'
import { isOptOutMessage } from './whatsappSafety'
import { configureWebPush, sendPushToSubscriptions } from './push'

type Inbound = { text: string; mediaId?: string; mediaType?: string; mime?: string; optOutCandidate?: string }

const MEDIA_LABELS: Record<string, string> = {
  image: '📷 Imagen', audio: '🎤 Audio', video: '🎥 Video', document: '📄 Documento', sticker: '🏷️ Sticker',
}

/** Convierte cualquier tipo de mensaje entrante en texto legible + referencia multimedia. */
export function parseInbound(msg: any): Inbound | null {
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

export type InboundNotification = { phone: string; title: string; text: string }

/** Comparación en tiempo constante para el token de verificación del webhook. */
export function verifyTokenMatches(received: string, expected: string): boolean {
  return !!expected && received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

/**
 * Aplica un "change" del webhook a la tienda indicada. Todo se filtra por
 * store_id: un evento nunca toca mensajes ni contactos de otra tienda.
 */
export async function processChange(storeId: string, value: any): Promise<InboundNotification[]> {
  const supabase = getServerSupabase()
  const notifications: InboundNotification[] = []

  // ── Estados de mensajes salientes ──
  for (const status of value?.statuses ?? []) {
    if (typeof status?.id !== 'string') continue
    const now = new Date().toISOString()
    if (status.status === 'failed') {
      const err = status.errors?.[0]
      await supabase.from('whatsapp_messages').update({
        status: 'failed',
        error_message: friendlyWhatsAppError(err?.code, err?.error_data?.details || err?.title || err?.message || 'Error de entrega'),
        updated_at: now,
      }).eq('store_id', storeId).eq('wa_message_id', status.id)
    } else if (STATUS_RANK[status.status]) {
      await supabase.from('whatsapp_messages')
        .update({ status: status.status, updated_at: now })
        .eq('store_id', storeId)
        .eq('wa_message_id', status.id)
        .in('status', LOWER_THAN(status.status))
    }
  }

  // ── Mensajes entrantes ──
  const profileByWaId = new Map<string, string>(
    (value?.contacts ?? []).map((c: any) => [String(c?.wa_id ?? ''), String(c?.profile?.name ?? '')]),
  )

  for (const msg of value?.messages ?? []) {
    const phone = normalizePhone(msg?.from)
    const parsed = parseInbound(msg)
    if (!phone || !parsed || typeof msg?.id !== 'string') continue

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('store_id', storeId)
      .in('phone', phoneVariants(phone))
      .limit(1)
      .maybeSingle()

    const profileName = profileByWaId.get(String(msg.from)) || null
    const { error } = await supabase.from('whatsapp_messages').insert([{
      store_id:      storeId,
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
        .eq('store_id', storeId)
    }

    notifications.push({ phone, title: contact?.name || profileName || fmtPhone(phone), text: parsed.text })
  }
  return notifications
}

/** Push a los dispositivos del equipo DE ESA TIENDA con los avisos de WhatsApp activados. */
export async function notifyStoreTeam(storeId: string, items: InboundNotification[]) {
  if (!items.length || !configureWebPush()) return
  const supabase = getServerSupabase()
  const { data: members } = await supabase.from('store_members').select('user_id')
    .eq('store_id', storeId).eq('status', 'active')
  const userIds = (members ?? []).map(m => m.user_id)
  if (!userIds.length) return
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('notify_whatsapp', true)
    .in('user_id', userIds)
  if (!subs?.length) return

  // Un aviso por conversación (el último mensaje), no uno por mensaje.
  const latest = new Map(items.map(i => [i.phone, i]))
  for (const item of latest.values()) {
    await sendPushToSubscriptions(subs, {
      title: `💬 ${item.title}`,
      body:  item.text.length > 140 ? `${item.text.slice(0, 137)}…` : item.text,
      url:   `/whatsapp?phone=${item.phone}`,
      tag:   `wa-${storeId.slice(0, 8)}-${item.phone}`,
    })
  }
}
