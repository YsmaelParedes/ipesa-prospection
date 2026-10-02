import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase-server'
import { sanitizeTemplateParam, sendWhatsAppTemplate, type WhatsAppTemplateComponent } from '@/lib/whatsapp'
import { jsonError, readJson } from '@/lib/validation'

// POST /api/whatsapp/test-send — envía una plantilla a un número de prueba
// (solo admin, para verificar que la integración de Meta quedó bien configurada)
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
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
  const result = await sendWhatsAppTemplate(to, template.trim(), lang, components)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ success: true, messageId: result.messageId })
}
