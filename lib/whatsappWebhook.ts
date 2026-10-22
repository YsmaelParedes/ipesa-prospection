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
import { markOptOut } from './whatsappQuota'
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
  const given = Buffer.from(received)
  const wanted = Buffer.from(expected)
  return wanted.length > 0 && given.length === wanted.length && timingSafeEqual(given, wanted)
}

/**
 * Copia de un mensaje que mandó otro responsable del número (el agente de IA
 * de Meta). `message` es el cuerpo tal como se envió a /messages: solo las
 * plantillas y los interactivos tienen otra forma que un mensaje entrante.
 */
export function parseAgentEcho(message: any): Inbound | null {
  switch (message?.type) {
    case 'template':
      return { text: `📋 Plantilla · ${String(message.template?.name ?? '').replace(/_/g, ' ')}` }
    case 'interactive': {
      const i = message.interactive ?? {}
      const options = [
        ...(i.action?.buttons ?? []).map((b: any) => b?.reply?.title),
        ...(i.action?.sections ?? []).flatMap((sec: any) => (sec?.rows ?? []).map((r: any) => r?.title)),
      ].filter(Boolean)
      const text = [i.header?.text, i.body?.text, i.footer?.text].filter(Boolean).join('\n')
      return { text: [text, options.length ? `👉 ${options.join(' · ')}` : ''].filter(Boolean).join('\n') || '[mensaje interactivo]' }
    }
    default: {
      const parsed = parseInbound(message)
      return parsed && { ...parsed, optOutCandidate: undefined }
    }
  }
}

type Supabase = ReturnType<typeof getServerSupabase>

async function contactFor(supabase: Supabase, storeId: string, phone: string) {
  const { data } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('store_id', storeId)
    .in('phone', phoneVariants(phone))
    .limit(1)
    .maybeSingle()
  return data as { id: string; name: string } | null
}

/** false si Meta reintentó un mensaje que ya guardamos. */
async function insertMessage(supabase: Supabase, row: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabase.from('whatsapp_messages').insert([row])
  // 23505 = ya lo teníamos. Cualquier otro error se lanza: el webhook responde
  // 500 y Meta reintenta (el índice único de wa_message_id evita duplicarlo).
  if (!error) return true
  if (error.code === '23505') return false
  throw new Error(`No se guardó el mensaje: ${error.message}`)
}

const toIso = (timestamp: unknown) => timestamp ? new Date(Number(timestamp) * 1000).toISOString() : undefined

/**
 * Aplica un "change" del webhook a la tienda indicada. Todo se filtra por
 * store_id: un evento nunca toca mensajes ni contactos de otra tienda.
 *
 * Mientras el agente de IA de Meta atiende un chat, lo de ese chat llega en
 * `value.standby` (campo "standby"): mensajes del cliente, copias de lo que
 * contestó el agente y sus palomitas. Esos mensajes no avisan al equipo
 * porque los está atendiendo el agente.
 */
export async function processChange(storeId: string, value: any): Promise<InboundNotification[]> {
  const supabase = getServerSupabase()
  const notifications = await applyEvents(supabase, storeId, value)
  const standby = value?.standby
  if (standby) {
    await applyEvents(supabase, storeId, standby)
    await saveAgentEchoes(supabase, storeId, standby.message_echoes)
  }
  return notifications
}

/** Estados de salientes y mensajes entrantes de un bloque del webhook. */
async function applyEvents(supabase: Supabase, storeId: string, value: any): Promise<InboundNotification[]> {
  const notifications: InboundNotification[] = []

  // ── Estados de mensajes salientes ──
  for (const status of value?.statuses ?? []) {
    if (typeof status?.id !== 'string') continue
    const now = new Date().toISOString()
    if (status.status === 'failed') {
      const err = status.errors?.[0]
      const code = Number.isInteger(err?.code) ? err.code as number : null
      const { data: failed } = await supabase.from('whatsapp_messages').update({
        status: 'failed',
        error_message: friendlyWhatsAppError(code ?? undefined, err?.error_data?.details || err?.title || err?.message || 'Error de entrega'),
        error_code: code,
        updated_at: now,
      }).eq('store_id', storeId).eq('wa_message_id', status.id).select('contact_id')
      // 131050: se dio de baja del marketing; Meta pide no volver a enviarle
      const contactId = failed?.[0]?.contact_id
      if (code === 131050 && contactId) await markOptOut(storeId, contactId)
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

    const contact = await contactFor(supabase, storeId, phone)
    const profileName = profileByWaId.get(String(msg.from)) || null
    const saved = await insertMessage(supabase, {
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
      created_at:    toIso(msg.timestamp),
    })
    if (!saved) continue

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

/**
 * Respuestas del agente de IA: salientes sin user_id ni plantilla. Así las
 * distingue la bandeja, porque lo que manda el equipo o una campaña siempre
 * lleva user_id.
 */
async function saveAgentEchoes(supabase: Supabase, storeId: string, echoes: any[] | undefined) {
  for (const echo of echoes ?? []) {
    const phone = normalizePhone(echo?.message?.to)
    const parsed = parseAgentEcho(echo?.message)
    if (!phone || !parsed || typeof echo?.id !== 'string') continue

    const contact = await contactFor(supabase, storeId, phone)
    await insertMessage(supabase, {
      store_id:      storeId,
      contact_id:    contact?.id ?? null,
      phone,
      direction:     'outbound',
      body:          parsed.text.slice(0, 4096),
      wa_message_id: echo.id,
      status:        'sent',
      media_id:      parsed.mediaId ?? null,
      media_type:    parsed.mediaType ?? null,
      media_mime:    parsed.mime ?? null,
      user_id:       null,
      template_name: null,
      created_at:    toIso(echo.timestamp),
    })
  }
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
      // Un aviso por chat; cada mensaje nuevo lo reemplaza y vuelve a sonar
      tag:   `wa-${storeId.slice(0, 8)}-${item.phone}`,
      renotify: true,
    })
  }
}
