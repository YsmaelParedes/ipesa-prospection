import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { countTemplateVariables, sanitizeTemplateParam } from '@/lib/whatsapp'
import { CAMPAIGN_BATCH_SIZE } from '@/lib/whatsappSafety'
import { uniqueRecipientsOutsideWindow24h } from '@/lib/whatsappQuota'
import { openOutbox, type TemplateMessage, type TemplateOutcome } from '@/lib/whatsappOutbox'
import { WHATSAPP_NOT_CONNECTED } from '@/lib/storeWhatsApp'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

const HELD_NOTE = 'Meta lo retuvo para evaluar la calidad de la plantilla; lo entrega en cuanto termine (normalmente en menos de una hora).'

/**
 * GET /api/whatsapp/campaigns/send — límite real de Meta y cuánto queda.
 * `limit`/`remaining` null = nivel sin límite. `used` = personas únicas
 * contactadas fuera de la ventana de atención en 24 h (lo que cuenta Meta).
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  try {
    const outbox = await openOutbox(ctx)
    if (!outbox) return jsonError(WHATSAPP_NOT_CONNECTED, 409)
    const [{ limit, tier, health }, used] = await Promise.all([
      outbox.limit({ fresh: true }),
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

/**
 * POST /api/whatsapp/campaigns/send — envía una plantilla (administrador: toca
 * el número real de la tienda y su reputación con Meta).
 * Body común: { template, language, category?, headerImageUrl?, bodyPreview,
 *               personalize?, bodyParams?: string[] }
 *  · Un destinatario (chat): { contactId | phone, force? } →
 *    { ok: true, held? } · { ok: false, error } · { ok: false, skipped: true, error }
 *  · Campaña: { recipients: [{ contactId }], campaignId?, campaignLabel? } (hasta CAMPAIGN_BATCH_SIZE) →
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
  const { contactId, template, language, category, headerImageUrl, personalize, bodyPreview, bodyParams, force, recipients, campaignId, campaignLabel } = body

  const templateName = typeof template === 'string' ? template.trim() : ''
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) return jsonError('template es requerido')
  const languageCode = typeof language === 'string' && /^[a-zA-Z_]{2,10}$/.test(language) ? language : 'es_MX'
  if (contactId !== undefined && !isUUID(contactId)) return jsonError('contactId inválido')
  if (headerImageUrl !== undefined && headerImageUrl !== null) {
    try { if (new URL(String(headerImageUrl)).protocol !== 'https:') throw new Error() } catch { return jsonError('La imagen de encabezado debe ser una URL https') }
  }

  const batch = recipients !== undefined
  // Varias personas = campaña: es un extra aparte, no basta con tener WhatsApp
  if (batch && !ctx.modules.campaigns) return jsonError('Las campañas no están activadas en tu tienda', 403)
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
    const outbox = await openOutbox(ctx)
    if (!outbox) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

    const message: TemplateMessage = {
      name: templateName, language: languageCode, headerImageUrl: headerImageUrl ? String(headerImageUrl) : null,
      bodyText, fixed, personalize: !!personalize,
      // La espera de 24 h tras un 131049 es para marketing; si no se sabe la categoría, se aplica.
      marketing: category !== 'UTILITY' && category !== 'AUTHENTICATION',
    }

    if (!batch) {
      const o = await outbox.template(message, { contactId, phone: typeof body.phone === 'string' ? body.phone : '', force: force === true })
      if (o.reason === 'blocked') return NextResponse.json({ ok: false, error: o.error }, { status: 409 })
      if (!contactId && o.reason === 'invalid_phone') return jsonError('Número inválido')
      if (o.reason === 'contact_not_found') return jsonError('Contacto no encontrado', 404)
      if (o.ok) return NextResponse.json({ ok: true, messageId: o.messageId, held: o.held, ...(o.held ? { note: HELD_NOTE } : {}) })
      return NextResponse.json({ ok: false, skipped: o.skipped, noWhatsApp: o.noWhatsApp, error: o.error, code: o.code }, { status: o.reason === 'quota' ? 429 : 200 })
    }

    // ── Campaña: todos los lotes de un mismo envío llegan con el mismo campaignId ──
    const tag = isUUID(campaignId)
      ? { id: campaignId, label: typeof campaignLabel === 'string' && campaignLabel.trim() ? campaignLabel.trim().slice(0, 120) : null }
      : null
    const { results, stop } = await outbox.campaign(message, (recipients as { contactId: string }[]).map(r => r.contactId), tag)
    return NextResponse.json({
      results: results.map(wireOutcome),
      ...(stop ? { stop } : {}),
    })
  } catch (error) {
    return serverError('POST /api/whatsapp/campaigns/send', error, 'Error al enviar la plantilla')
  }
}

/** Lo que recibe el navegador por destinatario (sin el motivo interno). */
function wireOutcome({ reason: _reason, ...o }: TemplateOutcome) {
  return { ...o, ...(o.held ? { note: HELD_NOTE } : {}) }
}

export const GET = withServerTiming(GETImpl)
