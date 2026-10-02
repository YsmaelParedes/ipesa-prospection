import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import {
  countTemplateVariables, renderTemplateBody, sanitizeTemplateParam, sendWhatsAppTemplate,
  type WhatsAppTemplateComponent,
} from '@/lib/whatsapp'
import { CAMPAIGN_DAILY_LIMIT, TEMPLATE_REPEAT_DAYS } from '@/lib/whatsappSafety'
import { contactForPhone } from '@/lib/whatsappInbox'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { normalizePhone, toWhatsAppNumber } from '@/lib/phone'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

type Supabase = ReturnType<typeof getServerSupabase>

// Límite diario por tienda (cada tienda envía desde su propio número)
async function sentInLast24h(supabase: Supabase, storeId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('direction', 'outbound')
    .not('template_name', 'is', null)
    .neq('status', 'failed') // un envío rechazado por Meta no cuenta para el límite diario
    .gte('created_at', since)
  if (error) throw error
  return count ?? 0
}

// GET /api/whatsapp/campaigns/send — cuota diaria restante (para mostrarla antes de enviar)
export async function GET() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  try {
    const sentToday = await sentInLast24h(getServerSupabase(), ctx.storeId)
    return NextResponse.json({ sentToday, limit: CAMPAIGN_DAILY_LIMIT, remaining: Math.max(0, CAMPAIGN_DAILY_LIMIT - sentToday) })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/send', error, 'Error al consultar la cuota')
  }
}

/**
 * POST /api/whatsapp/campaigns/send — envía una plantilla a UN destinatario
 * (dueño/admin: toca el número real de la tienda y su reputación con Meta).
 * Body: { contactId | phone, template, language, headerImageUrl?,
 *         bodyPreview, personalize?, bodyParams?: string[], skipRecent? }
 * El cliente llama una vez por contacto con pausa entre llamadas (ver
 * lib/whatsappSafety.ts) para mostrar progreso real sin timeouts.
 * Respuestas: { ok: true } · { ok: false, error } · { ok: false, skipped: true, error }.
 */
export async function POST(req: NextRequest) {
  // Plantilla a un solo número (desde el chat) solo exige WhatsApp; varias = campaña
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const { contactId, template, language, headerImageUrl, personalize, bodyPreview, bodyParams, skipRecent } = body

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

    // ── Reglas anti-bloqueo ──
    if (await sentInLast24h(supabase, ctx.storeId) >= CAMPAIGN_DAILY_LIMIT) {
      return jsonError(`Ya se alcanzó el límite diario de ${CAMPAIGN_DAILY_LIMIT} plantillas enviadas. Intenta de nuevo más tarde.`, 429)
    }
    if (skipRecent !== false) {
      const since = new Date(Date.now() - TEMPLATE_REPEAT_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase.from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', ctx.storeId)
        .eq('phone', phone).eq('direction', 'outbound').eq('template_name', templateName)
        .neq('status', 'failed').gte('created_at', since)
      if ((count ?? 0) > 0) {
        return NextResponse.json({ ok: false, skipped: true, error: `Ya recibió esta plantilla en los últimos ${TEMPLATE_REPEAT_DAYS} días` })
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

    const result = await sendWhatsAppTemplate(creds, toWhatsAppNumber(phone), templateName, languageCode, components)

    await supabase.from('whatsapp_messages').insert([{
      store_id: ctx.storeId,
      contact_id: contact?.id ?? null,
      phone,
      direction: 'outbound',
      body: bodyText ? renderTemplateBody(bodyText, values) : `[Plantilla: ${templateName}]`,
      wa_message_id: result.messageId ?? null,
      status: result.ok ? 'sent' : 'failed',
      template_name: templateName,
      error_message: result.ok ? null : result.error,
      user_id: ctx.uid,
    }])

    return result.ok
      ? NextResponse.json({ ok: true, messageId: result.messageId })
      : NextResponse.json({ ok: false, error: result.error, code: result.code })
  } catch (error) {
    return serverError('POST /api/whatsapp/campaigns/send', error, 'Error al enviar la plantilla')
  }
}
