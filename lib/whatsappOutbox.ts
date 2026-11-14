/**
 * Salida de WhatsApp: todo lo que la tienda manda por su número (plantillas a
 * una persona, envíos de campaña, plantilla de prueba, texto y archivos) y su
 * registro en el historial (whatsapp_messages).
 *
 * Quien llama no ve credenciales, reservas, bajas, «sin WhatsApp», límite de
 * Meta ni cómo se guarda cada mensaje: recibe un resultado con un `reason`
 * estable para decidir la respuesta HTTP. Meta se alcanza por fetch (en los
 * tests, simulado; ver tests/whatsapp-outbox-harness.cjs).
 *
 * Reglas de registro:
 *  · Plantillas: se reservan en la base ANTES de enviar (reserve_whatsapp_template
 *    bloquea la tienda para no rebasar el límite de Meta en paralelo) y luego se
 *    completan con la respuesta de Meta.
 *  · Texto y archivos: se envían y después se guardan; si Meta los rechaza no
 *    quedan en el historial.
 */
import { getServerSupabase, type StoreContext } from './supabase-server'
import {
  countTemplateVariables, renderTemplateBody, sanitizeTemplateParam, sendWhatsAppMedia, sendWhatsAppTemplate,
  sendWhatsAppText, uploadWhatsAppMedia,
  type WhatsAppCreds, type WhatsAppSendResult, type WhatsAppTemplateComponent,
} from './whatsapp'
import { CAMPAIGN_CONCURRENCY, MARKETING_RETRY_HOURS, STOP_CAMPAIGN_CODES } from './whatsappSafety'
import { getMessagingLimit, markOptOut, type MessagingLimit } from './whatsappQuota'
import { contactForPhone } from './whatsappInbox'
import { noWhatsAppByPhone, noWhatsAppFor } from './campaignPeople'
import type { NoWhatsApp } from './campaignKinds'
import { getStoreWhatsAppCreds } from './storeWhatsApp'
import { audienceBlock } from './campaignAudience'
import { normalizePhone, toWhatsAppNumber } from './phone'
import { SEND_LABELS, type SendKind } from './whatsappFiles'
import { reportError } from './errorReport'
import type { ThreadMessage } from './whatsappThreadTypes'

export const OUTBOX_MESSAGE_FIELDS = 'id, phone, direction, body, status, error_message, template_name, media_id, media_type, media_mime, profile_name, contact_id, user_id, origin, created_at'

const BLOCKED_NOTE = 'Meta tiene bloqueado el envío desde este número.'

/** Por qué no salió una plantilla. */
export type SkipReason =
  | 'contact_not_found' | 'invalid_phone' | 'opt_out' | 'landline' | 'no_whatsapp'
  | 'marketing_limit' | 'quota' | 'blocked' | 'meta' | 'server'

export type TemplateOutcome = {
  contactId?: string; ok: boolean; reason?: SkipReason
  skipped?: boolean; noWhatsApp?: boolean
  error?: string; code?: number; held?: boolean; messageId?: string
}

/** Plantilla ya validada (nombre, idioma y variables). */
export type TemplateMessage = {
  name: string; language: string; headerImageUrl: string | null
  /** Texto de la plantilla con {{n}}: se guarda en el historial ya relleno. */
  bodyText: string
  /** Valores fijos de las variables; con `personalize`, {{1}} es el nombre del contacto. */
  fixed: string[]; personalize: boolean
  /** Marketing (o categoría desconocida): aplica la espera de 24 h tras un 131049. */
  marketing: boolean
}

/** Envío de campaña (uno por segmento) al que pertenece cada mensaje. */
export type CampaignTag = { id: string; label: string | null }

export type ConversationSend =
  | { status: 'sent'; message: ThreadMessage }
  | { status: 'rejected'; error?: string; code?: number }
  /** Salió por WhatsApp pero no se pudo guardar en el historial. */
  | { status: 'unrecorded'; cause: unknown }

export type OutgoingFile = { bytes: Uint8Array; mime: string; kind: SendKind; filename: string; caption: string }

export type Outbox = {
  /** Límite de Meta y salud del número (en caché 10 min salvo `fresh`). */
  limit(opts?: { fresh?: boolean }): Promise<MessagingLimit>
  /** Plantilla a una persona (desde el chat): por contacto o por número; `force` intenta aunque Meta lo haya reportado sin WhatsApp. */
  template(message: TemplateMessage, to: { contactId?: string; phone?: string; force?: boolean }): Promise<TemplateOutcome>
  /** Un lote de campaña: poca concurrencia; se corta ante el límite de Meta o un error que afecta a todo el número. */
  campaign(message: TemplateMessage, contactIds: string[], tag: CampaignTag | null): Promise<{ results: TemplateOutcome[]; stop: string | null }>
  /** Plantilla de prueba a cualquier número (verifica la integración); comparte bajas, límite e historial con las campañas. */
  testTemplate(input: { to: string; name: string; language: string; headerImageUrl: string | null; bodyParam: string | null }): Promise<TemplateOutcome>
  /** Texto libre dentro de la conversación. */
  text(phone: string, body: string): Promise<ConversationSend>
  /** Archivo (foto, video o documento) dentro de la conversación. */
  media(phone: string, file: OutgoingFile): Promise<ConversationSend>
}

type Sender = Pick<StoreContext, 'storeId' | 'uid'>

/** La salida de la tienda, o null si aún no conecta su número de WhatsApp. */
export async function openOutbox(sender: Sender): Promise<Outbox | null> {
  const creds = await getStoreWhatsAppCreds(sender.storeId)
  if (!creds) return null
  return {
    limit: (opts = {}) => getMessagingLimit(sender.storeId, creds, opts),
    template: (message, to) => sendTemplateToOne(sender, creds, message, to),
    campaign: (message, contactIds, tag) => sendCampaignBatch(sender, creds, message, contactIds, tag),
    testTemplate: input => sendTestTemplate(sender, creds, input),
    text: (phone, body) => sendConversation(sender, phone, () => sendWhatsAppText(creds, toWhatsAppNumber(phone), body), () => ({ body })),
    media: (phone, file) => sendFile(sender, creds, phone, file),
  }
}

// ── Plantillas ──────────────────────────────────────────────────────────────

type ContactRow = { id: string; name: string; phone: string; wa_opt_out: boolean; line_type?: string | null }
const CONTACT_FIELDS = 'id, name, phone, wa_opt_out, line_type'

/** Lo que un lote necesita de la base en dos consultas en vez de dos por destinatario. */
type Preloaded = { contacts: Map<string, ContactRow>; noWhatsApp: Map<string, NoWhatsApp> }

async function preloadBatch(storeId: string, contactIds: string[]): Promise<Preloaded> {
  const { data, error } = await getServerSupabase().from('contacts').select(CONTACT_FIELDS)
    .eq('store_id', storeId).in('id', contactIds)
  if (error) throw error
  const contacts = new Map((data ?? []).map(c => [c.id, c as ContactRow]))
  const phones = [...contacts.values()].map(c => normalizePhone(c.phone)).filter(p => /^\d{10}$/.test(p))
  return { contacts, noWhatsApp: await noWhatsAppByPhone(storeId, phones) }
}

/** Con BLOCKED en la salud del número, Meta no deja salir nada. */
function blockedReason(limit: MessagingLimit): string | null {
  return limit.health?.canSendMessage === 'BLOCKED' ? [BLOCKED_NOTE, ...(limit.health.healthNotes ?? [])].join(' ') : null
}

async function sendTemplateToOne(sender: Sender, creds: WhatsAppCreds, message: TemplateMessage, to: { contactId?: string; phone?: string; force?: boolean }): Promise<TemplateOutcome> {
  const limit = await getMessagingLimit(sender.storeId, creds)
  const blocked = blockedReason(limit)
  if (blocked) return { ok: false, reason: 'blocked', error: blocked }
  return deliverTemplate(sender, creds, message, limit.limit, to)
}

async function sendCampaignBatch(sender: Sender, creds: WhatsAppCreds, message: TemplateMessage, contactIds: string[], tag: CampaignTag | null) {
  const limit = await getMessagingLimit(sender.storeId, creds)
  const blocked = blockedReason(limit)
  if (blocked) return { results: [], stop: blocked }

  const pre = await preloadBatch(sender.storeId, contactIds)
  const results: TemplateOutcome[] = []
  let stop: string | null = null
  let next = 0
  const worker = async () => {
    while (!stop && next < contactIds.length) {
      const id = contactIds[next++]
      let o: TemplateOutcome
      try {
        o = await deliverTemplate(sender, creds, message, limit.limit, { contactId: id }, pre, tag)
      } catch (error) {
        // Un error con un contacto no tumba el lote: los demás ya enviados
        // deben llegar al navegador. Si el fallo es del servidor (base lenta,
        // timeout), se detiene la campaña para no seguir cargándolo.
        if ((error as { code?: string })?.code === 'P0002') {
          o = { contactId: id, ok: false, reason: 'invalid_phone', error: 'El teléfono guardado de este contacto no es válido; revísalo en su ficha.' }
        } else {
          console.error('[whatsapp/campaña] contacto', id, error)
          o = { contactId: id, ok: false, reason: 'server', error: 'No se pudo enviar por un error del servidor.' }
          stop ??= 'Envío detenido por un error del servidor. Los contactos restantes no recibieron nada; intenta de nuevo en unos minutos.'
        }
      }
      results.push(o)
      stop ??= stopReasonOf(o)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CAMPAIGN_CONCURRENCY, contactIds.length) }, worker))
  return { results, stop }
}

/** Motivo para detener la campaña: límite de Meta alcanzado o un error que afecta a todo el número/plantilla. */
function stopReasonOf(o: TemplateOutcome): string | null {
  if (o.reason === 'quota') return o.error ?? 'Se alcanzó el límite de Meta.'
  if (o.code !== undefined && STOP_CAMPAIGN_CODES.includes(o.code)) return `Envío detenido: ${o.error}`
  return null
}

/** Una plantilla a un destinatario respetando bajas, fijos, "sin WhatsApp" y el límite de Meta. */
async function deliverTemplate(
  sender: Sender, creds: WhatsAppCreds, message: TemplateMessage, limit: number | null,
  target: { contactId?: string; phone?: string; force?: boolean }, pre?: Preloaded, tag: CampaignTag | null = null,
): Promise<TemplateOutcome> {
  let contact: ContactRow | null = null
  let phone = ''
  if (target.contactId) {
    const data = pre
      ? pre.contacts.get(target.contactId) ?? null
      : (await getServerSupabase().from('contacts').select(CONTACT_FIELDS).eq('id', target.contactId).eq('store_id', sender.storeId).maybeSingle()).data as ContactRow | null
    if (!data) return { contactId: target.contactId, ok: false, reason: 'contact_not_found', error: 'Contacto no encontrado' }
    contact = data
    phone = normalizePhone(data.phone)
  } else {
    phone = normalizePhone(target.phone ?? '')
    if (/^\d{10}$/.test(phone)) contact = await contactForPhone(sender.storeId, phone)
  }
  const contactId = target.contactId
  if (!/^\d{10}$/.test(phone)) return { contactId, ok: false, reason: 'invalid_phone', error: 'Sin teléfono válido registrado' }

  // Bajas, fijos y "sin WhatsApp": la misma regla con la que Campañas deja elegir.
  // A un número sin WhatsApp no se le vuelve a mandar nada (puede ser un teléfono
  // fijo); desde el chat solo si se confirma "intentar de todos modos".
  const optOut = !!contact?.wa_opt_out
  const lineType = target.contactId ? contact?.line_type ?? null : null
  let noWhatsApp: NoWhatsApp | null = null
  if (!optOut && lineType !== 'fijo' && !(target.force && !target.contactId)) {
    noWhatsApp = pre ? pre.noWhatsApp.get(phone) ?? null : await noWhatsAppFor(sender.storeId, phone)
  }
  const block = audienceBlock({ optOut, lineType, noWhatsApp: !!noWhatsApp })
  if (block === 'opt_out') return { contactId, ok: false, reason: 'opt_out', skipped: true, error: 'Pidió no recibir campañas (dado de baja)' }
  if (block === 'landline') return { contactId, ok: false, reason: 'landline', skipped: true, noWhatsApp: true, error: 'Sin WhatsApp: está marcado como teléfono fijo.' }
  if (block === 'no_whatsapp' && noWhatsApp) {
    const times = noWhatsApp.failures === 1 ? 'el último envío' : `los últimos ${noWhatsApp.failures} envíos`
    return { contactId, ok: false, reason: 'no_whatsapp', skipped: true, noWhatsApp: true, error: `Sin WhatsApp: Meta rechazó ${times}. Puede ser un teléfono fijo.` }
  }

  // ── Variables del cuerpo: {{1}} = nombre (si se personaliza) o texto fijo ──
  const varCount = countTemplateVariables(message.bodyText)
  const firstName = sanitizeTemplateParam((contact?.name || '').split(/\s+/)[0] || '') || 'cliente'
  const values = Array.from({ length: varCount }, (_, i) => (i === 0 && message.personalize ? firstName : message.fixed[i]))

  const components: WhatsAppTemplateComponent[] = []
  if (message.headerImageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: message.headerImageUrl } }] })
  if (values.length) components.push({ type: 'body', parameters: values.map(text => ({ type: 'text' as const, text })) })

  const reserved = await reserveTemplateSend(sender, {
    phone, template: message.name, contactId: contact?.id ?? null,
    body: message.bodyText ? renderTemplateBody(message.bodyText, values) : `[Plantilla: ${message.name}]`,
    limit, marketing: message.marketing,
  })
  if (!reserved.ok) return { contactId, ok: false, reason: reserved.reason, skipped: reserved.skipped, error: reserved.error }
  const result = await sendWhatsAppTemplate(creds, toWhatsAppNumber(phone), message.name, message.language, components)
  await finishTemplateSend(reserved.id, sender.storeId, result, contact?.id ?? null, tag)

  return result.ok
    ? { contactId, ok: true, messageId: result.messageId, held: result.messageStatus === 'held_for_quality_assessment' }
    : { contactId, ok: false, reason: 'meta', error: result.error, code: result.code }
}

async function sendTestTemplate(sender: Sender, creds: WhatsAppCreds, input: { to: string; name: string; language: string; headerImageUrl: string | null; bodyParam: string | null }): Promise<TemplateOutcome> {
  const components: WhatsAppTemplateComponent[] = []
  if (input.headerImageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: input.headerImageUrl } }] })
  if (input.bodyParam) components.push({ type: 'body', parameters: [{ type: 'text', text: sanitizeTemplateParam(input.bodyParam) }] })

  const phone = normalizePhone(input.to)
  const valid = /^\d{10}$/.test(phone)
  const contact = valid ? await contactForPhone(sender.storeId, phone) : null
  if (contact?.wa_opt_out) return { ok: false, reason: 'opt_out', skipped: true, error: 'Ese número pidió no recibir mensajes (dado de baja)' }
  const { limit } = await getMessagingLimit(sender.storeId, creds)
  const reserved = await reserveTemplateSend(sender, {
    phone: valid ? phone : input.to, template: input.name, contactId: contact?.id ?? null,
    // Una prueba comparte consentimiento, límite de Meta e historial con las campañas.
    body: `[Plantilla de prueba: ${input.name}]`, limit, marketing: true,
  })
  if (!reserved.ok) return { ok: false, reason: reserved.reason, skipped: reserved.skipped, error: reserved.error }
  const result = await sendWhatsAppTemplate(creds, input.to, input.name, input.language, components)
  await finishTemplateSend(reserved.id, sender.storeId, result, contact?.id ?? null)
  return result.ok
    ? { ok: true, messageId: result.messageId }
    : { ok: false, reason: 'meta', error: result.error, code: result.code }
}

/** Reserva y registra antes del envío: el bloqueo de tienda evita sobrepasar el límite en paralelo. */
async function reserveTemplateSend(sender: Sender, input: {
  phone: string; template: string; body: string; contactId: string | null; limit: number | null; marketing: boolean
}): Promise<{ ok: true; id: string } | { ok: false; reason: 'quota' | 'opt_out' | 'marketing_limit'; error: string; skipped: boolean }> {
  const { data, error } = await getServerSupabase().rpc('reserve_whatsapp_template', {
    p_store: sender.storeId, p_actor: sender.uid, p_phone: input.phone, p_template: input.template,
    p_body: input.body, p_contact: input.contactId, p_limit: input.limit, p_marketing: input.marketing,
  })
  if (error) throw error
  if (data?.allowed === true && typeof data.id === 'string') return { ok: true, id: data.id }
  if (data?.reason === 'quota') return {
    ok: false, reason: 'quota', skipped: false,
    error: `Ya se alcanzó el límite de Meta de ${input.limit?.toLocaleString('es-MX')} personas en 24 h. Puedes seguir escribiendo a quien te haya escrito en las últimas 24 h; para el resto, intenta más tarde.`,
  }
  if (data?.reason === 'opt_out') return { ok: false, reason: 'opt_out', skipped: true, error: 'Pidió no recibir campañas (dado de baja)' }
  if (data?.reason === 'marketing_limit') return {
    ok: false, reason: 'marketing_limit', skipped: true,
    error: `Meta pidió esperar ${MARKETING_RETRY_HOURS} h antes de reenviarle marketing (límite por persona)`,
  }
  throw new Error('Respuesta de reserva inválida')
}

/** La reserva ya queda en el historial incluso si Meta o la actualización final fallan. */
async function finishTemplateSend(id: string, storeId: string, result: WhatsAppSendResult, contactId: string | null = null, tag: CampaignTag | null = null) {
  const { error } = await getServerSupabase().from('whatsapp_messages').update({
    ...(tag ? { campaign_id: tag.id, campaign_label: tag.label } : {}),
    wa_message_id: result.messageId ?? null, status: result.ok ? 'sent' : result.code ? 'failed' : 'pending',
    error_message: result.ok ? null : result.error,
    error_code: result.ok ? null : result.code ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('store_id', storeId)
  if (error) console.error('[whatsapp/finalizar-envío]', error.message)
  if (result.code === 131050 && contactId) await markOptOut(storeId, contactId)
  // Un error que afecta a todo el número o la plantilla (token vencido, cuenta restringida…) lo debe saber el operador de la plataforma
  if (!result.ok && result.code && STOP_CAMPAIGN_CODES.includes(result.code)) {
    reportError({ source: 'whatsapp', context: `Meta ${result.code} al enviar plantilla`, error: new Error(result.error ?? `Error ${result.code}`), storeId })
  }
}

// ── Conversación: texto y archivos ──────────────────────────────────────────

async function sendFile(sender: Sender, creds: WhatsAppCreds, phone: string, file: OutgoingFile): Promise<ConversationSend> {
  const upload = await uploadWhatsAppMedia(creds, new Blob([file.bytes as BlobPart], { type: file.mime }), file.filename)
  if (!upload.ok) return { status: 'rejected', error: upload.error, code: upload.code }
  // Igual que los que llegan: "<marca> Documento · cotización.pdf" (ver lib/messagePrefix)
  const shown = file.caption || (file.kind === 'document' ? file.filename : '')
  return sendConversation(sender, phone,
    () => sendWhatsAppMedia(creds, toWhatsAppNumber(phone), file.kind, upload.id, { caption: file.caption || undefined, filename: file.filename }),
    () => ({
      body: shown ? `${SEND_LABELS[file.kind]} · ${shown}` : SEND_LABELS[file.kind],
      media_id: upload.id, media_type: file.kind, media_mime: file.mime,
    }))
}

/** Envía y, si Meta lo aceptó, lo guarda en el historial con el contacto del número. */
async function sendConversation(
  sender: Sender, phone: string,
  send: () => Promise<WhatsAppSendResult>, fields: () => Record<string, unknown>,
): Promise<ConversationSend> {
  const result = await send()
  if (!result.ok) return { status: 'rejected', error: result.error, code: result.code }
  try {
    const contact = await contactForPhone(sender.storeId, phone)
    const { data, error } = await getServerSupabase().from('whatsapp_messages').insert([{
      store_id: sender.storeId,
      contact_id: contact?.id ?? null,
      phone,
      direction: 'outbound',
      ...fields(),
      wa_message_id: result.messageId,
      status: 'sent',
      user_id: sender.uid,
    }]).select(OUTBOX_MESSAGE_FIELDS)
    if (error) throw error
    return { status: 'sent', message: data?.[0] as ThreadMessage }
  } catch (cause) {
    return { status: 'unrecorded', cause }
  }
}
