import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore, type StoreContext } from '@/lib/supabase-server'
import {
  countTemplateVariables, renderTemplateBody, sanitizeTemplateParam, sendWhatsAppTemplate,
  type WhatsAppCreds, type WhatsAppTemplateComponent,
} from '@/lib/whatsapp'
import { CAMPAIGN_BATCH_SIZE, CAMPAIGN_CONCURRENCY, STOP_CAMPAIGN_CODES } from '@/lib/whatsappSafety'
import { finishTemplateSend, getMessagingLimit, reserveTemplateSend, uniqueRecipientsOutsideWindow24h } from '@/lib/whatsappQuota'
import { contactForPhone } from '@/lib/whatsappInbox'
import { noWhatsAppFor } from '@/lib/campaignPeople'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { normalizePhone, toWhatsAppNumber } from '@/lib/phone'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

const HELD_NOTE = 'Meta lo retuvo para evaluar la calidad de la plantilla; lo entrega en cuanto termine (normalmente en menos de una hora).'
const BLOCKED_NOTE = 'Meta tiene bloqueado el envío desde este número.'

/**
 * GET /api/whatsapp/campaigns/send — límite real de Meta y cuánto queda.
 * `limit`/`remaining` null = nivel sin límite. `used` = personas únicas
 * contactadas fuera de la ventana de atención en 24 h (lo que cuenta Meta).
 */
export async function GET() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  try {
    const creds = await getStoreWhatsAppCreds(ctx.storeId)
    if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)
    const [{ limit, tier, health }, used] = await Promise.all([
      getMessagingLimit(ctx.storeId, creds, { fresh: true }),
      uniqueRecipientsOutsideWindow24h(ctx.storeId),
    ])
    return NextResponse.json({
      used, limit, tier, remaining: limit === null ? null : Math.max(0, limit - used),
      canSendMessage: health?.canSendMessage ?? null, healthNotes: health?.healthNotes ?? [],
    })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/send', error, 'Error al consultar el límite de Meta')
  }
}

type Shared = {
  templateName: string; languageCode: string; headerImageUrl: string | null
  bodyText: string; varCount: number; fixed: string[]; personalize: boolean
  marketing: boolean; limit: number | null
}

type Outcome = {
  contactId?: string; ok: boolean; skipped?: boolean; noWhatsApp?: boolean
  error?: string; code?: number; held?: boolean; messageId?: string
  /** 429: se alcanzó el límite de Meta */
  status?: number
}

/** Envía la plantilla a un destinatario respetando bajas, "sin WhatsApp" y el límite de Meta. */
async function sendOne(ctx: StoreContext, creds: WhatsAppCreds, shared: Shared, target: { contactId?: string; phone?: string; force?: boolean }): Promise<Outcome> {
  const supabase = getServerSupabase()
  let contact: { id: string; name: string; phone: string; wa_opt_out: boolean } | null = null
  let phone = ''
  if (target.contactId) {
    const { data } = await supabase.from('contacts').select('id, name, phone, wa_opt_out')
      .eq('id', target.contactId).eq('store_id', ctx.storeId).maybeSingle()
    if (!data) return { contactId: target.contactId, ok: false, error: 'Contacto no encontrado' }
    contact = data
    phone = normalizePhone(data.phone)
  } else {
    phone = normalizePhone(target.phone ?? '')
    if (/^\d{10}$/.test(phone)) contact = await contactForPhone(ctx.storeId, phone)
  }
  const contactId = target.contactId
  if (!/^\d{10}$/.test(phone)) return { contactId, ok: false, error: 'Sin teléfono válido registrado' }

  if (contact?.wa_opt_out) return { contactId, ok: false, skipped: true, error: 'Pidió no recibir campañas (dado de baja)' }

  // Sin WhatsApp: no se le vuelve a mandar nada (puede ser un teléfono fijo).
  // En campañas nunca; desde el chat solo si se confirma "intentar de todos modos".
  if (!(target.force && !target.contactId)) {
    const noWhatsApp = await noWhatsAppFor(ctx.storeId, phone)
    if (noWhatsApp) {
      const times = noWhatsApp.failures === 1 ? 'el último envío' : `los últimos ${noWhatsApp.failures} envíos`
      return { contactId, ok: false, skipped: true, noWhatsApp: true, error: `Sin WhatsApp: Meta rechazó ${times}. Puede ser un teléfono fijo.` }
    }
  }

  // ── Variables del cuerpo: {{1}} = nombre (si se personaliza) o texto fijo ──
  const firstName = sanitizeTemplateParam((contact?.name || '').split(/\s+/)[0] || '') || 'cliente'
  const values = Array.from({ length: shared.varCount }, (_, i) => (i === 0 && shared.personalize ? firstName : shared.fixed[i]))

  const components: WhatsAppTemplateComponent[] = []
  if (shared.headerImageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: shared.headerImageUrl } }] })
  if (values.length) components.push({ type: 'body', parameters: values.map(text => ({ type: 'text' as const, text })) })

  // Bajas, espera tras un 131049 y límite de Meta en una reserva atómica compartida con las pruebas.
  const reserved = await reserveTemplateSend(ctx, {
    phone, template: shared.templateName, contactId: contact?.id ?? null,
    body: shared.bodyText ? renderTemplateBody(shared.bodyText, values) : `[Plantilla: ${shared.templateName}]`,
    limit: shared.limit, marketing: shared.marketing,
  })
  if (!reserved.ok) return { contactId, ok: false, skipped: reserved.skipped, error: reserved.error, status: reserved.status }
  const result = await sendWhatsAppTemplate(creds, toWhatsAppNumber(phone), shared.templateName, shared.languageCode, components)
  await finishTemplateSend(reserved.id, ctx.storeId, result, contact?.id ?? null)

  return result.ok
    ? { contactId, ok: true, messageId: result.messageId, held: result.messageStatus === 'held_for_quality_assessment' }
    : { contactId, ok: false, error: result.error, code: result.code }
}

/** Motivo para detener la campaña: límite de Meta alcanzado o un error que afecta a todo el número/plantilla. */
function stopReasonOf(o: Outcome): string | null {
  if (o.status === 429) return o.error ?? 'Se alcanzó el límite de Meta.'
  if (o.code !== undefined && STOP_CAMPAIGN_CODES.includes(o.code)) return `Envío detenido: ${o.error}`
  return null
}

/**
 * POST /api/whatsapp/campaigns/send — envía una plantilla (dueño/admin: toca
 * el número real de la tienda y su reputación con Meta).
 * Body común: { template, language, category?, headerImageUrl?, bodyPreview,
 *               personalize?, bodyParams?: string[] }
 *  · Un destinatario (chat): { contactId | phone, force? } →
 *    { ok: true, held? } · { ok: false, error } · { ok: false, skipped: true, error }
 *  · Campaña: { recipients: [{ contactId }] } (hasta CAMPAIGN_BATCH_SIZE) →
 *    { results: Outcome[], stop?: string }. Se envía con poca concurrencia,
 *    muy por debajo de los 80 mensajes/s de Meta.
 * A un número que Meta reportó sin WhatsApp no se le envía; `force` (solo con
 * `phone`, desde el chat) lo intenta de todos modos.
 */
export async function POST(req: NextRequest) {
  // Plantilla a un solo número (desde el chat) solo exige WhatsApp; varias = campaña
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const { contactId, template, language, category, headerImageUrl, personalize, bodyPreview, bodyParams, force, recipients } = body

  const templateName = typeof template === 'string' ? template.trim() : ''
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) return jsonError('template es requerido')
  const languageCode = typeof language === 'string' && /^[a-zA-Z_]{2,10}$/.test(language) ? language : 'es_MX'
  if (contactId !== undefined && !isUUID(contactId)) return jsonError('contactId inválido')
  if (headerImageUrl !== undefined && headerImageUrl !== null) {
    try { if (new URL(String(headerImageUrl)).protocol !== 'https:') throw new Error() } catch { return jsonError('La imagen de encabezado debe ser una URL https') }
  }

  const batch = recipients !== undefined
  if (batch) {
    if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > CAMPAIGN_BATCH_SIZE
        || !recipients.every((r: any) => isUUID(r?.contactId))) {
      return jsonError(`recipients debe tener de 1 a ${CAMPAIGN_BATCH_SIZE} contactos`)
    }
  }

  const bodyText = typeof bodyPreview === 'string' ? bodyPreview.slice(0, 2000) : ''
  const varCount = countTemplateVariables(bodyText)
  const fixed = Array.isArray(bodyParams) ? bodyParams.map(v => (typeof v === 'string' ? sanitizeTemplateParam(v) : '')) : []
  for (let i = 0; i < varCount; i++) {
    if (!(i === 0 && personalize) && !fixed[i]) return jsonError(`Falta el valor de la variable {{${i + 1}}} de la plantilla`)
  }

  try {
    const creds = await getStoreWhatsAppCreds(ctx.storeId)
    if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

    // health_status de Meta: con BLOCKED ningún envío sale
    const { limit, health } = await getMessagingLimit(ctx.storeId, creds)
    if (health?.canSendMessage === 'BLOCKED') {
      const error = [BLOCKED_NOTE, ...(health.healthNotes ?? [])].join(' ')
      return batch ? NextResponse.json({ results: [], stop: error }) : NextResponse.json({ ok: false, error }, { status: 409 })
    }

    const shared: Shared = {
      templateName, languageCode, headerImageUrl: headerImageUrl ? String(headerImageUrl) : null,
      bodyText, varCount, fixed, personalize: !!personalize,
      // La espera de 24 h tras un 131049 es para marketing; si no se sabe la categoría, se aplica.
      marketing: category !== 'UTILITY' && category !== 'AUTHENTICATION',
      limit,
    }

    if (!batch) {
      const o = await sendOne(ctx, creds, shared, { contactId, phone: typeof body.phone === 'string' ? body.phone : '', force: force === true })
      if (!contactId && o.error === 'Sin teléfono válido registrado') return jsonError('Número inválido')
      if (o.error === 'Contacto no encontrado') return jsonError('Contacto no encontrado', 404)
      if (o.ok) return NextResponse.json({ ok: true, messageId: o.messageId, held: o.held, ...(o.held ? { note: HELD_NOTE } : {}) })
      return NextResponse.json({ ok: false, skipped: o.skipped, noWhatsApp: o.noWhatsApp, error: o.error, code: o.code }, { status: o.status ?? 200 })
    }

    // ── Campaña: lote con concurrencia limitada; se corta ante un motivo de paro ──
    const queue = (recipients as { contactId: string }[]).map(r => r.contactId)
    const results: Outcome[] = []
    let stop: string | null = null
    let next = 0
    const worker = async () => {
      while (!stop && next < queue.length) {
        const id = queue[next++]
        const o = await sendOne(ctx, creds, shared, { contactId: id })
        results.push(o)
        stop ??= stopReasonOf(o)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CAMPAIGN_CONCURRENCY, queue.length) }, worker))
    return NextResponse.json({
      results: results.map(({ status, ...o }) => ({ ...o, ...(o.held ? { note: HELD_NOTE } : {}) })),
      ...(stop ? { stop } : {}),
    })
  } catch (error) {
    return serverError('POST /api/whatsapp/campaigns/send', error, 'Error al enviar la plantilla')
  }
}
