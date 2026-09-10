import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'
import { sendWhatsAppTemplate, WhatsAppTemplateComponent } from '@/lib/whatsapp'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

// POST /api/whatsapp/campaigns/send — envía una plantilla a una lista de
// contactos elegidos a mano, personalizando {{1}} con el nombre de cada uno
// (solo admin — toca el número real del negocio y su reputación con Meta)
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const { contactIds, template, language, headerImageId, personalize } = await req.json()

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: 'contactIds debe ser un arreglo no vacío' }, { status: 400 })
  }
  if (contactIds.length > 200) {
    return NextResponse.json({ error: 'Máximo 200 contactos por envío' }, { status: 400 })
  }
  if (!template || typeof template !== 'string' || template.trim().length === 0) {
    return NextResponse.json({ error: 'template es requerido' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const templateName = template.trim()
  const languageCode = (language && typeof language === 'string') ? language : 'es_MX'

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .in('id', contactIds)
  if (error) throw error

  const results: Array<{ contactId: string; name: string; ok: boolean; error?: string }> = []

  for (const c of contacts ?? []) {
    if (!c.phone) {
      results.push({ contactId: c.id, name: c.name, ok: false, error: 'Sin teléfono registrado' })
      continue
    }

    const components: WhatsAppTemplateComponent[] = []
    if (headerImageId) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { id: headerImageId } }] })
    }
    if (personalize) {
      const firstName = (c.name || '').trim().split(/\s+/)[0] || 'cliente'
      components.push({ type: 'body', parameters: [{ type: 'text', text: firstName }] })
    }

    const to = c.phone.length === 10 ? `52${c.phone}` : c.phone
    const sendResult = await sendWhatsAppTemplate(to, templateName, languageCode, components)

    await supabase.from('whatsapp_messages').insert([{
      contact_id: c.id,
      phone: c.phone,
      direction: 'outbound',
      body: `[Plantilla: ${templateName}]`,
      wa_message_id: sendResult.messageId ?? null,
      status: sendResult.ok ? 'sent' : 'failed',
      template_name: templateName,
      error_message: sendResult.ok ? null : sendResult.error,
      user_id: ctx.uid,
    }])

    results.push({ contactId: c.id, name: c.name, ok: sendResult.ok, error: sendResult.error })

    // pausa breve entre envíos para no saturar la API de Meta
    await wait(250)
  }

  const sent   = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({ results, sent, failed })
}
