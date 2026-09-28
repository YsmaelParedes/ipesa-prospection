import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'
import { sendWhatsAppTemplate, WhatsAppTemplateComponent } from '@/lib/whatsapp'
import { CAMPAIGN_DAILY_LIMIT, CAMPAIGN_MAX_PER_REQUEST, campaignDelayMs, wait } from '@/lib/whatsappSafety'

// Con la pausa entre envíos, una tanda completa puede acercarse a varios
// minutos — se declara explícito para no depender del timeout por defecto.
export const maxDuration = 300

async function sentInLast24h(supabase: ReturnType<typeof getServerSupabase>): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .not('template_name', 'is', null)
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
  return NextResponse.json({
    sentToday, limit: CAMPAIGN_DAILY_LIMIT, remaining, maxPerRequest: CAMPAIGN_MAX_PER_REQUEST,
  })
}

// POST /api/whatsapp/campaigns/send — envía una plantilla a una lista de
// contactos elegidos a mano, personalizando {{1}} con el nombre de cada uno
// (solo admin — toca el número real del negocio y su reputación con Meta).
// Aplica una pausa entre cada envío y topes diarios/por tanda para no
// disparar la detección de spam de Meta, aunque la plantilla ya esté
// aprobada — ver lib/whatsappSafety.ts.
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const { contactIds, template, language, headerImageUrl, personalize, bodyPreview } = await req.json()

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: 'contactIds debe ser un arreglo no vacío' }, { status: 400 })
  }
  if (contactIds.length > CAMPAIGN_MAX_PER_REQUEST) {
    return NextResponse.json({
      error: `Máximo ${CAMPAIGN_MAX_PER_REQUEST} contactos por envío (evita que el envío se corte a la mitad). Manda el resto en otra tanda.`,
    }, { status: 400 })
  }
  if (!template || typeof template !== 'string' || template.trim().length === 0) {
    return NextResponse.json({ error: 'template es requerido' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  const sentToday = await sentInLast24h(supabase)
  const remaining = Math.max(0, CAMPAIGN_DAILY_LIMIT - sentToday)
  if (contactIds.length > remaining) {
    return NextResponse.json({
      error: remaining === 0
        ? `Ya se alcanzó el límite diario de ${CAMPAIGN_DAILY_LIMIT} plantillas enviadas. Intenta de nuevo más tarde.`
        : `Límite diario: ya se enviaron ${sentToday} de ${CAMPAIGN_DAILY_LIMIT} plantillas hoy. Puedes enviar hasta ${remaining} más.`,
    }, { status: 400 })
  }

  const templateName = template.trim()
  const languageCode = (language && typeof language === 'string') ? language : 'es_MX'
  const bodyTemplate = (typeof bodyPreview === 'string' && bodyPreview.trim()) ? bodyPreview : ''

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

    const firstName = (c.name || '').trim().split(/\s+/)[0] || 'cliente'

    const components: WhatsAppTemplateComponent[] = []
    if (headerImageUrl) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: headerImageUrl } }] })
    }
    if (personalize) {
      components.push({ type: 'body', parameters: [{ type: 'text', text: firstName }] })
    }

    const to = c.phone.length === 10 ? `52${c.phone}` : c.phone
    const sendResult = await sendWhatsAppTemplate(to, templateName, languageCode, components)

    const renderedBody = bodyTemplate
      ? bodyTemplate.replace('{{1}}', personalize ? firstName : '{{1}}')
      : `[Plantilla: ${templateName}]`

    await supabase.from('whatsapp_messages').insert([{
      contact_id: c.id,
      phone: c.phone,
      direction: 'outbound',
      body: renderedBody,
      wa_message_id: sendResult.messageId ?? null,
      status: sendResult.ok ? 'sent' : 'failed',
      template_name: templateName,
      error_message: sendResult.ok ? null : sendResult.error,
      user_id: ctx.uid,
    }])

    results.push({ contactId: c.id, name: c.name, ok: sendResult.ok, error: sendResult.error })

    // pausa (con jitter) entre envíos — ver lib/whatsappSafety.ts
    await wait(campaignDelayMs())
  }

  const sent   = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  return NextResponse.json({ results, sent, failed })
}
