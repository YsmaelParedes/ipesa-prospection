import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import {
  countTemplateVariables, renderTemplateBody, sanitizeTemplateParam, sendWhatsAppTemplate,
  type WhatsAppTemplateComponent,
} from '@/lib/whatsapp'
import { CAMPAIGN_DAILY_LIMIT } from '@/lib/whatsappSafety'
import { finishTemplateSend, reserveTemplateSend, templatesSentInLast24h } from '@/lib/whatsappQuota'
import { contactForPhone } from '@/lib/whatsappInbox'
import { noWhatsAppFor } from '@/lib/campaignPeople'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { normalizePhone, toWhatsAppNumber } from '@/lib/phone'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

// GET /api/whatsapp/campaigns/send — cuota diaria restante (para mostrarla antes de enviar)
export async function GET() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  try {
    const sentToday = await templatesSentInLast24h(ctx.storeId)
    return NextResponse.json({ sentToday, limit: CAMPAIGN_DAILY_LIMIT, remaining: Math.max(0, CAMPAIGN_DAILY_LIMIT - sentToday) })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/send', error, 'Error al consultar la cuota')
  }
}

/**
 * POST /api/whatsapp/campaigns/send — envía una plantilla a UN destinatario
 * (dueño/admin: toca el número real de la tienda y su reputación con Meta).
 * Body: { contactId | phone, template, language, headerImageUrl?,
 *         bodyPreview, personalize?, bodyParams?: string[], skipRecent?, force? }
 * El cliente llama una vez por contacto con pausa entre llamadas (ver
 * lib/whatsappSafety.ts) para mostrar progreso real sin timeouts.
 * A un número que Meta reportó sin WhatsApp no se le envía; `force` (solo con
 * `phone`, desde el chat) lo intenta de todos modos.
 * Respuestas: { ok: true } · { ok: false, error } · { ok: false, skipped: true, error }.
 */
export async function POST(req: NextRequest) {
  // Plantilla a un solo número (desde el chat) solo exige WhatsApp; varias = campaña
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const { contactId, template, language, headerImageUrl, personalize, bodyPreview, bodyParams, skipRecent, force } = body

  const templateName = typeof template === 'string' ? template.trim() : ''
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) return jsonError('template es requerido')
  const languageCode = typeof language === 'string' && /^[a-zA-Z_]{2,10}$/.test(language) ? language : 'es_MX'
  if (contactId !== undefined && !isUUID(contactId)) return jsonError('contactId inválido')
  if (headerImageUrl !== undefined && headerImageUrl !== null) {
    try { if (new URL(String(headerImageUrl)).protocol !== 'https:') throw new Error() } catch { return jsonError('La imagen de encabezado debe ser una URL https') }
  }

  try {
    const supabase = getServerSupabase()
    const creds = await getStoreWhatsAppCreds(ctx.storeId)
    if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

    // ── Destinatario ──
    let contact: { id: string; name: string; phone: string; wa_opt_out: boolean } | null = null
    let phone = ''
    if (contactId) {
      const { data } = await supabase.from('contacts').select('id, name, phone, wa_opt_out')
        .eq('id', contactId).eq('store_id', ctx.storeId).maybeSingle()
      if (!data) return jsonError('Contacto no encontrado', 404)
      contact = data
      phone = normalizePhone(data.phone)
    } else {
      phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '')
      if (!/^\d{10}$/.test(phone)) return jsonError('Número inválido')
      contact = await contactForPhone(ctx.storeId, phone)
    }
    if (!/^\d{10}$/.test(phone)) return NextResponse.json({ ok: false, error: 'Sin teléfono válido registrado' })

    if (contact?.wa_opt_out) {
      return NextResponse.json({ ok: false, skipped: true, error: 'Pidió no recibir campañas (dado de baja)' })
    }

    // Sin WhatsApp: no se le vuelve a mandar nada (puede ser un teléfono fijo).
    // En campañas nunca; desde el chat solo si se confirma "intentar de todos modos".
    if (!(force === true && !contactId)) {
      const noWhatsApp = await noWhatsAppFor(ctx.storeId, phone)
      if (noWhatsApp) {
        const times = noWhatsApp.failures === 1 ? 'el último envío' : `los últimos ${noWhatsApp.failures} envíos`
        return NextResponse.json({ ok: false, skipped: true, noWhatsApp: true, error: `Sin WhatsApp: Meta rechazó ${times}. Puede ser un teléfono fijo.` })
      }
    }

    // ── Variables del cuerpo: {{1}} = nombre (si se personaliza) o texto fijo ──
    const bodyText = typeof bodyPreview === 'string' ? bodyPreview.slice(0, 2000) : ''
    const varCount = countTemplateVariables(bodyText)
    const fixed = Array.isArray(bodyParams) ? bodyParams.map(v => (typeof v === 'string' ? sanitizeTemplateParam(v) : '')) : []
    const firstName = sanitizeTemplateParam((contact?.name || '').split(/\s+/)[0] || '') || 'cliente'
    const values: string[] = []
    for (let i = 0; i < varCount; i++) {
      const value = i === 0 && personalize ? firstName : fixed[i]
      if (!value) return jsonError(`Falta el valor de la variable {{${i + 1}}} de la plantilla`)
      values.push(value)
    }

    const components: WhatsAppTemplateComponent[] = []
    if (headerImageUrl) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: String(headerImageUrl) } }] })
    if (values.length) components.push({ type: 'body', parameters: values.map(text => ({ type: 'text' as const, text })) })

    // Reglas anti-bloqueo y registro en una reserva atómica compartida con las pruebas.
    const reserved = await reserveTemplateSend(ctx, {
      phone, template: templateName, contactId: contact?.id ?? null,
      body: bodyText ? renderTemplateBody(bodyText, values) : `[Plantilla: ${templateName}]`,
      skipRecent: skipRecent !== false,
    })
    if (!reserved.ok) return NextResponse.json({ ok: false, skipped: reserved.skipped, error: reserved.error }, { status: reserved.status })
    const result = await sendWhatsAppTemplate(creds, toWhatsAppNumber(phone), templateName, languageCode, components)
    await finishTemplateSend(reserved.id, ctx.storeId, result)

    return result.ok
      ? NextResponse.json({ ok: true, messageId: result.messageId })
      : NextResponse.json({ ok: false, error: result.error, code: result.code })
  } catch (error) {
    return serverError('POST /api/whatsapp/campaigns/send', error, 'Error al enviar la plantilla')
  }
}
