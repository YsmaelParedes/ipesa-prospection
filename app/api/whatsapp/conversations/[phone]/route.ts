import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { markWhatsAppRead, sendWhatsAppText } from '@/lib/whatsapp'
import { contactForPhone } from '@/lib/whatsappInbox'
import { normalizePhone, toWhatsAppNumber } from '@/lib/phone'
import { isWindowOpen, windowClosesAt } from '@/lib/whatsappSafety'
import { jsonError, readJson, serverError } from '@/lib/validation'

type Ctx = { params: Promise<{ phone: string }> }

const MESSAGE_FIELDS = 'id, phone, direction, body, status, error_message, template_name, media_id, media_type, media_mime, profile_name, contact_id, user_id, created_at'

async function phoneParam(params: Ctx['params']): Promise<string | null> {
  const phone = normalizePhone(decodeURIComponent((await params).phone))
  return /^\d{10}$/.test(phone) ? phone : null
}

/**
 * GET /api/whatsapp/conversations/[phone][?preview=1&limit=n]
 * Hilo completo + ficha del CRM (contacto, leads visibles para el usuario)
 * + estado de la ventana de 24 h. Sin `preview`, marca los entrantes como
 * leídos (también en el WhatsApp del cliente).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx
  const phone = await phoneParam(params)
  if (!phone) return jsonError('Número inválido')

  const preview = req.nextUrl.searchParams.get('preview') === '1'
  const limit   = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')) || 300, 1), 500)

  try {
    const supabase = getServerSupabase()
    const [{ data: newestFirst, error }, { data: lastInbound }] = await Promise.all([
      supabase.from('whatsapp_messages').select(MESSAGE_FIELDS).eq('phone', phone)
        .order('created_at', { ascending: false }).limit(limit),
      supabase.from('whatsapp_messages').select('created_at, profile_name, contact_id, wa_message_id')
        .eq('phone', phone).eq('direction', 'inbound')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (error) throw error
    const messages = (newestFirst ?? []).reverse()

    const linkedId = lastInbound?.contact_id ?? messages.find(m => m.contact_id)?.contact_id ?? null
    const contact = await contactForPhone(phone, linkedId)

    // Leads del contacto que el usuario puede ver (empleado: suyos + heredados)
    let leads: { id: string; name: string; estado: string; monto: number | null; canal: string; created_at: string; user_id: string | null }[] = []
    if (contact) {
      const { data } = await supabase.from('leads')
        .select('id, name, estado, monto, canal, created_at, user_id')
        .or(`contact_id.eq.${contact.id},phone.eq.${phone}`)
        .order('created_at', { ascending: false }).limit(20)
      leads = (data ?? []).filter(l => ctx.role === 'admin' || !l.user_id || l.user_id === ctx.uid)
    }

    let markedRead = 0
    if (!preview) {
      const { data: marked } = await supabase.from('whatsapp_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('phone', phone).eq('direction', 'inbound').is('read_at', null)
        .select('id')
      // Palomitas azules para el cliente: basta con marcar el último entrante
      const waId = lastInbound?.wa_message_id
      markedRead = marked?.length ?? 0
      if (markedRead && waId) after(() => markWhatsAppRead(waId))
    }

    return NextResponse.json({
      phone,
      messages,
      contact,
      leads,
      profileName: lastInbound?.profile_name ?? null,
      lastInboundAt: lastInbound?.created_at ?? null,
      windowOpen: isWindowOpen(lastInbound?.created_at),
      windowClosesAt: windowClosesAt(lastInbound?.created_at),
      markedRead,
    })
  } catch (error) {
    return serverError('GET /api/whatsapp/conversations/[phone]', error, 'Error al obtener la conversación')
  }
}

// POST /api/whatsapp/conversations/[phone] — responde con texto libre
// (Meta solo lo permite dentro de las 24 h desde el último mensaje del cliente)
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx
  const phone = await phoneParam(params)
  if (!phone) return jsonError('Número inválido')

  const body = await readJson(req)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return jsonError('El mensaje no puede estar vacío')
  if (text.length > 4096) return jsonError('El mensaje excede 4096 caracteres')

  const result = await sendWhatsAppText(toWhatsAppNumber(phone), text)
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: 502 })

  try {
    const contact = await contactForPhone(phone)
    const { data, error } = await getServerSupabase()
      .from('whatsapp_messages')
      .insert([{
        contact_id: contact?.id ?? null,
        phone,
        direction: 'outbound',
        body: text,
        wa_message_id: result.messageId,
        status: 'sent',
        user_id: ctx.uid,
      }])
      .select(MESSAGE_FIELDS)
    if (error) throw error
    return NextResponse.json({ message: data?.[0] })
  } catch (error) {
    // El mensaje SÍ salió; solo falló guardarlo en el historial
    return serverError('POST /api/whatsapp/conversations/[phone]', error, 'El mensaje se envió pero no se pudo guardar en el historial')
  }
}

// PATCH /api/whatsapp/conversations/[phone] — { optOut: boolean } en el contacto vinculado
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx
  const phone = await phoneParam(params)
  if (!phone) return jsonError('Número inválido')

  const body = await readJson(req)
  if (typeof body?.optOut !== 'boolean') return jsonError('optOut debe ser verdadero o falso')

  const contact = await contactForPhone(phone)
  if (!contact) return jsonError('Primero guarda este número como contacto', 404)

  const { error } = await getServerSupabase()
    .from('contacts')
    .update({ wa_opt_out: body.optOut, wa_opt_out_at: body.optOut ? new Date().toISOString() : null })
    .eq('id', contact.id)
  if (error) return serverError('PATCH /api/whatsapp/conversations/[phone]', error, 'Error al guardar la preferencia')
  return NextResponse.json({ ok: true, optOut: body.optOut })
}
