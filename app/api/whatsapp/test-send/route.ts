import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { sanitizeTemplateParam, sendWhatsAppTemplate, type WhatsAppTemplateComponent } from '@/lib/whatsapp'
import { jsonError, readJson, serverError } from '@/lib/validation'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { finishTemplateSend, reserveTemplateSend } from '@/lib/whatsappQuota'
import { contactForPhone } from '@/lib/whatsappInbox'
import { normalizePhone } from '@/lib/phone'

// POST /api/whatsapp/test-send — envía una plantilla a un número de prueba
// (dueño/admin, para verificar que la integración de Meta quedó bien configurada).
// Cuenta para el límite diario, respeta las bajas y queda en el historial.
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const { to, template, language, headerImageUrl, bodyParam } = body

  if (typeof to !== 'string' || !/^\d{10,15}$/.test(to)) return jsonError('to debe ser un número en formato 52XXXXXXXXXX (solo dígitos)')
  if (typeof template !== 'string' || !/^[a-z0-9_]{1,512}$/.test(template.trim())) {
    return jsonError('template es requerido (el nombre exacto de la plantilla aprobada en Meta)')
  }

  const components: WhatsAppTemplateComponent[] = []
  if (typeof headerImageUrl === 'string' && headerImageUrl.trim()) {
    try { if (new URL(headerImageUrl.trim()).protocol !== 'https:') throw new Error() } catch { return jsonError('La URL de la imagen debe ser https') }
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl.trim() } }] })
  }
  if (typeof bodyParam === 'string' && bodyParam.trim()) {
    components.push({ type: 'body', parameters: [{ type: 'text', text: sanitizeTemplateParam(bodyParam) }] })
  }

  const lang = typeof language === 'string' && /^[a-zA-Z_]{2,10}$/.test(language) ? language : 'es_MX'
  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  try {
    const phone = normalizePhone(to)
    const contact = /^\d{10}$/.test(phone) ? await contactForPhone(ctx.storeId, phone) : null
    if (contact?.wa_opt_out) return jsonError('Ese número pidió no recibir mensajes (dado de baja)', 409)
    const reserved = await reserveTemplateSend(ctx, {
      phone: /^\d{10}$/.test(phone) ? phone : to, template: template.trim(), contactId: contact?.id ?? null,
      // Una prueba explícita puede repetirse; comparte consentimiento, cuota e historial.
      body: `[Plantilla de prueba: ${template.trim()}]`, skipRecent: false,
    })
    if (!reserved.ok) return jsonError(reserved.error, reserved.status === 200 ? 409 : reserved.status)
    const result = await sendWhatsAppTemplate(creds, to, template.trim(), lang, components)
    await finishTemplateSend(reserved.id, ctx.storeId, result)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (error) {
    return serverError('POST /api/whatsapp/test-send', error, 'Error al enviar la prueba')
  }
}
