import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'
import { sendWhatsAppTemplate, WhatsAppTemplateComponent } from '@/lib/whatsapp'
import { CAMPAIGN_DAILY_LIMIT } from '@/lib/whatsappSafety'

async function sentInLast24h(supabase: ReturnType<typeof getServerSupabase>): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .not('template_name', 'is', null)
    .neq('status', 'failed') // un envío rechazado por Meta no cuenta para el límite diario
    .gte('created_at', since)
  if (error) throw error
  return count ?? 0
}

// GET /api/whatsapp/campaigns/send — cuota diaria restante (para mostrarla
// en la UI antes de enviar)
export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }
  const supabase = getServerSupabase()
  const sentToday = await sentInLast24h(supabase)
  const remaining = Math.max(0, CAMPAIGN_DAILY_LIMIT - sentToday)
  return NextResponse.json({ sentToday, limit: CAMPAIGN_DAILY_LIMIT, remaining })
}

// POST /api/whatsapp/campaigns/send — envía una plantilla a UN contacto
// (solo admin — toca el número real del negocio y su reputación con Meta).
// El cliente llama este endpoint una vez por contacto, con una pausa entre
// llamadas (ver lib/whatsappSafety.ts) — así puede mostrar progreso real en
// la UI y ninguna petición individual queda esperando varios minutos.
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const { contactId, template, language, headerImageUrl, personalize, bodyPreview } = await req.json()

  if (!contactId || typeof contactId !== 'string') {
    return NextResponse.json({ error: 'contactId es requerido' }, { status: 400 })
  }
  if (!template || typeof template !== 'string' || template.trim().length === 0) {
    return NextResponse.json({ error: 'template es requerido' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  const sentToday = await sentInLast24h(supabase)
  if (sentToday >= CAMPAIGN_DAILY_LIMIT) {
    return NextResponse.json({
      error: `Ya se alcanzó el límite diario de ${CAMPAIGN_DAILY_LIMIT} plantillas enviadas. Intenta de nuevo más tarde.`,
    }, { status: 400 })
  }

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('id', contactId)
    .maybeSingle()
  if (contactError) throw contactError
  if (!contact) {
    return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
  }
  if (!contact.phone) {
    return NextResponse.json({ error: 'Sin teléfono registrado' }, { status: 400 })
  }

  const templateName = template.trim()
  const languageCode = (language && typeof language === 'string') ? language : 'es_MX'
  const bodyTemplate = (typeof bodyPreview === 'string' && bodyPreview.trim()) ? bodyPreview : ''
  const firstName = (contact.name || '').trim().split(/\s+/)[0] || 'cliente'

  const components: WhatsAppTemplateComponent[] = []
  if (headerImageUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl } }] })
  }
  if (personalize) {
    components.push({ type: 'body', parameters: [{ type: 'text', text: firstName }] })
  }

  const to = contact.phone.length === 10 ? `52${contact.phone}` : contact.phone
  const sendResult = await sendWhatsAppTemplate(to, templateName, languageCode, components)

  const renderedBody = bodyTemplate
    ? bodyTemplate.replace('{{1}}', personalize ? firstName : '{{1}}')
    : `[Plantilla: ${templateName}]`

  await supabase.from('whatsapp_messages').insert([{
    contact_id: contact.id,
    phone: contact.phone,
    direction: 'outbound',
    body: renderedBody,
    wa_message_id: sendResult.messageId ?? null,
    status: sendResult.ok ? 'sent' : 'failed',
    template_name: templateName,
    error_message: sendResult.ok ? null : sendResult.error,
    user_id: ctx.uid,
  }])

  if (!sendResult.ok) {
    return NextResponse.json({ ok: false, error: sendResult.error }, { status: 200 })
  }
  return NextResponse.json({ ok: true, messageId: sendResult.messageId })
}
