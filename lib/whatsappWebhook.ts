/**
 * Procesa los eventos del webhook de WhatsApp Cloud API para UNA tienda:
 * estados de mensajes salientes y mensajes entrantes. Lo usan las dos
 * entradas del webhook (la URL original y la URL propia de cada tienda).
 */
import { timingSafeEqual } from 'node:crypto'
import { getServerSupabase, storeAudience } from './supabase-server'
import { effectiveModules } from './stores'
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

const toIso = (timestamp: unknown) => {
  const ms = Number(timestamp) * 1000
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined
}

/**
 * Aplica un "change" del webhook a la tienda indicada. Todo se filtra por
 * store_id: un evento nunca toca mensajes ni contactos de otra tienda.
 *
 * Mientras el agente de IA de Meta atiende un chat, lo de ese chat llega en
 * `value.standby` (campo "standby"): mensajes del cliente, copias de lo que
 * contestó el agente y sus palomitas. Esos mensajes no avisan al equipo
 * porque los está atendiendo el agente.
 */
export async function processChange(storeId: string, value: any, field?: string): Promise<InboundNotification[]> {
  const supabase = getServerSupabase()
  // Coexistencia: historial importado y lo que la tienda manda desde su celular
  if (field === 'history') { await saveHistory(supabase, storeId, value); return [] }
  if (field === 'smb_message_echoes') { await saveBusinessEchoes(supabase, storeId, value?.message_echoes); return [] }
  if (field === 'smb_app_state_sync') return [] // Los contactos del celular no se tocan
  const notifications = await applyEvents(supabase, storeId, value)
  const standby = value?.standby
  if (standby) {
    await applyEvents(supabase, storeId, standby)
    notifications.push(...await saveAgentEchoes(supabase, storeId, standby.message_echoes))
  }
  // El agente le pasó el chat al CRM (campo "messaging_handovers")
  if (value?.type === 'control_passed' && value.control_passed?.new_owner_role !== 'ai_agent') {
    const phone = normalizePhone(value.sender?.phone_number)
    if (phone) notifications.push(handoffItem(phone, (await contactFor(supabase, storeId, phone))?.name))
  }
  return notifications
}

const HANDOFF_TEXT = 'El agente de IA pidió que alguien del equipo conteste.'

/**
 * ¿El agente avisó que pasará el chat a una persona? Respaldo del evento
 * "control_passed", que Meta no manda cuando el agente solo suelta el chat.
 */
export function isHandoffMessage(text: string): boolean {
  return /\b(representante|alguien (de|del) (nuestro )?equipo|persona del equipo|agente humano|a representative|someone from (our|the) team)\b/i.test(text)
}

const handoffItem = (phone: string, name: string | undefined): InboundNotification =>
  ({ phone, title: `🙋 ${name || fmtPhone(phone)}`, text: HANDOFF_TEXT })

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
 * lleva user_id. Si el agente dice que pasará el chat a una persona, se
 * avisa al equipo.
 */
async function saveAgentEchoes(supabase: Supabase, storeId: string, echoes: any[] | undefined) {
  const notifications: InboundNotification[] = []
  for (const echo of echoes ?? []) {
    const phone = normalizePhone(echo?.message?.to)
    const parsed = parseAgentEcho(echo?.message)
    if (!phone || !parsed || typeof echo?.id !== 'string') continue

    const contact = await contactFor(supabase, storeId, phone)
    const saved = await insertMessage(supabase, {
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
    if (saved && isHandoffMessage(parsed.text)) {
      notifications.push(handoffItem(phone, contact?.name))
    }
  }
  return notifications
}

/**
 * Mensajes que la tienda mandó desde la app WhatsApp Business de su celular
 * (coexistencia): se guardan como salientes con origin 'phone' y no avisan a
 * nadie. Ediciones y borrados no se reflejan.
 */
async function saveBusinessEchoes(supabase: Supabase, storeId: string, echoes: any[] | undefined) {
  for (const echo of echoes ?? []) {
    if (echo?.type === 'edit' || echo?.type === 'revoke') continue
    const phone = normalizePhone(echo?.to)
    const parsed = parseInbound(echo)
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
      origin:        'phone',
      created_at:    toIso(echo.timestamp),
    })
  }
}

const HISTORY_STATUS: Record<string, string> = { sent: 'sent', delivered: 'delivered', read: 'read', played: 'read' }
const HISTORY_BATCH = 500
// Las búsquedas por lista van en la URL: con lotes chicos no pasan de ~8 KB (414 URI Too Long)
const ID_LOOKUP_BATCH = 80
const PHONE_LOOKUP_BATCH = 60

/** Contactos de la tienda para muchos números a la vez (teléfono de 10 dígitos → id). */
async function contactsFor(supabase: Supabase, storeId: string, phones: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const unique = [...new Set(phones)]
  for (let i = 0; i < unique.length; i += PHONE_LOOKUP_BATCH) {
    const { data, error } = await supabase.from('contacts').select('id, phone')
      .eq('store_id', storeId).in('phone', unique.slice(i, i + PHONE_LOOKUP_BATCH).flatMap(phoneVariants))
    if (error) throw new Error(`No se leyeron los contactos del historial: ${error.message}`)
    for (const c of (data ?? []) as { id: string; phone: string }[]) {
      const key = normalizePhone(c.phone)
      if (key && !found.has(key)) found.set(key, c.id)
    }
  }
  return found
}

/** Ids de mensaje que ya están guardados (Meta reintenta y el índice único es global). */
async function existingMessageIds(supabase: Supabase, ids: string[]): Promise<Set<string>> {
  const seen = new Set<string>()
  for (let i = 0; i < ids.length; i += ID_LOOKUP_BATCH) {
    const { data, error } = await supabase.from('whatsapp_messages')
      .select('wa_message_id').in('wa_message_id', ids.slice(i, i + ID_LOOKUP_BATCH))
    if (error) throw new Error(`No se leyó el historial: ${error.message}`)
    for (const r of data ?? []) seen.add(r.wa_message_id as string)
  }
  return seen
}

/**
 * Historial de chats que Meta manda una sola vez al conectar un número de
 * WhatsApp Business (coexistencia), por partes y en desorden. Cada mensaje
 * se guarda leído (no llena la bandeja de pendientes), sin avisos, ligado al
 * contacto si ya existe (no se crean contactos). Si la tienda no quiso
 * compartirlo, Meta manda el error 2593109.
 */
async function saveHistory(supabase: Supabase, storeId: string, value: any) {
  // Archivo de un mensaje del historial (llega después, solo de los últimos 14 días)
  for (const msg of value?.messages ?? []) {
    const parsed = parseInbound(msg)
    if (!parsed?.mediaId || typeof msg?.id !== 'string') continue
    await supabase.from('whatsapp_messages')
      .update({ media_id: parsed.mediaId, media_type: parsed.mediaType ?? null, media_mime: parsed.mime ?? null, body: parsed.text.slice(0, 4096) })
      .eq('store_id', storeId).eq('wa_message_id', msg.id).eq('origin', 'history')
  }

  for (const chunk of value?.history ?? []) {
    if (chunk?.errors?.length) {
      const declined = chunk.errors.some((e: any) => e?.code === 2593109)
      await supabase.from('store_whatsapp').update({ history_status: declined ? 'declined' : 'failed', updated_at: new Date().toISOString() }).eq('store_id', storeId)
      continue
    }
    const rows: Record<string, unknown>[] = []
    const readAt = new Date().toISOString()
    const threads: any[] = Array.isArray(chunk?.threads) ? chunk.threads : []
    // Un solo viaje a la base por lote de números (un aviso puede traer cientos de chats)
    const contacts = await contactsFor(supabase, storeId, threads.map(t => normalizePhone(t?.id)).filter(Boolean))
    const ids = new Set<string>()
    for (const thread of threads) {
      const phone = normalizePhone(thread?.id)
      if (!phone) continue
      const contactId = contacts.get(phone) ?? null
      for (const msg of thread?.messages ?? []) {
        if (typeof msg?.id !== 'string' || ids.has(msg.id)) continue
        ids.add(msg.id)
        const parsed: Inbound | null = msg.type === 'media_placeholder' ? { text: '📎 Archivo' } : parseInbound(msg)
        if (!parsed) continue
        const inbound = normalizePhone(msg.from) === phone
        const status = String(msg.history_context?.status ?? '').toLowerCase()
        rows.push({
          store_id:      storeId,
          contact_id:    contactId,
          phone,
          direction:     inbound ? 'inbound' : 'outbound',
          body:          parsed.text.slice(0, 4096),
          wa_message_id: msg.id,
          status:        inbound ? 'received' : (HISTORY_STATUS[status] ?? 'sent'),
          media_id:      parsed.mediaId ?? null,
          media_type:    parsed.mediaType ?? null,
          media_mime:    parsed.mime ?? null,
          user_id:       null,
          origin:        'history',
          read_at:       inbound ? readAt : null,
          created_at:    toIso(msg.timestamp),
        })
      }
    }
    let imported = 0
    for (let i = 0; i < rows.length; i += HISTORY_BATCH) {
      const batch = rows.slice(i, i + HISTORY_BATCH)
      // Meta reintenta: lo que ya estaba se salta
      const seen = await existingMessageIds(supabase, batch.map(r => r.wa_message_id as string))
      const fresh = batch.filter(r => !seen.has(r.wa_message_id as string))
      if (!fresh.length) continue
      const { error } = await supabase.from('whatsapp_messages').insert(fresh)
      if (error) throw new Error(`No se guardó el historial: ${error.message}`)
      imported += fresh.length
    }
    const done = Number(chunk?.metadata?.progress) >= 100
    const { error } = await supabase.rpc('add_whatsapp_history_imported', { p_store_id: storeId, p_count: imported, p_done: done })
    if (error) throw new Error(`No se contó el historial: ${error.message}`)
  }
}

/** Push a los dispositivos del equipo DE ESA TIENDA con los avisos de WhatsApp activados. */
export async function notifyStoreTeam(storeId: string, items: InboundNotification[]) {
  if (!items.length || !configureWebPush()) return
  const supabase = getServerSupabase()
  // Solo quien puede abrir la bandeja: con WhatsApp vigente en el plan y, en
  // Litro, solo el administrador principal
  const audience = (await storeAudience([storeId])).get(storeId)
  if (!audience || !effectiveModules(audience.store).whatsapp) return
  const userIds = [...audience.users]
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
