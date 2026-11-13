import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { jsonError, readJson, serverError } from '@/lib/validation'
import { WHATSAPP_NOT_CONNECTED } from '@/lib/storeWhatsApp'
import { openOutbox } from '@/lib/whatsappOutbox'

// POST /api/whatsapp/test-send — envía una plantilla a un número de prueba
// (administrador, para verificar que la integración de Meta quedó bien configurada).
// Cuenta para el límite de Meta, respeta las bajas y queda en el historial.
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

  let image: string | null = null
  if (typeof headerImageUrl === 'string' && headerImageUrl.trim()) {
    try { if (new URL(headerImageUrl.trim()).protocol !== 'https:') throw new Error() } catch { return jsonError('La URL de la imagen debe ser https') }
    image = headerImageUrl.trim()
  }

  const lang = typeof language === 'string' && /^[a-zA-Z_]{2,10}$/.test(language) ? language : 'es_MX'
  const outbox = await openOutbox(ctx)
  if (!outbox) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  try {
    const o = await outbox.testTemplate({
      to, name: template.trim(), language: lang, headerImageUrl: image,
      bodyParam: typeof bodyParam === 'string' && bodyParam.trim() ? bodyParam : null,
    })
    if (o.reason === 'meta') return NextResponse.json({ error: o.error }, { status: 502 })
    if (!o.ok) return jsonError(o.error ?? 'No se pudo enviar la prueba', o.reason === 'quota' ? 429 : 409)
    return NextResponse.json({ success: true, messageId: o.messageId })
  } catch (error) {
    return serverError('POST /api/whatsapp/test-send', error, 'Error al enviar la prueba')
  }
}
