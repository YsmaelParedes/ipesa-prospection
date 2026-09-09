import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'
import { sendWhatsAppText } from '@/lib/whatsapp'

// GET /api/whatsapp/conversations/[phone] — hilo completo de un número,
// marca los mensajes entrantes como leídos al abrirlo.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { phone } = await params
    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
    if (error) throw error

    const unreadIds = (data ?? []).filter(m => m.direction === 'inbound' && !m.read_at).map(m => m.id)
    if (unreadIds.length) {
      await supabase.from('whatsapp_messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
    }

    return NextResponse.json({ messages: data ?? [] })
  } catch (error: any) {
    console.error('[GET /api/whatsapp/conversations/[phone]]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener la conversación' }, { status: 500 })
  }
}

// POST /api/whatsapp/conversations/[phone] — responde con texto libre
// (solo funciona dentro de la ventana de 24h desde el último mensaje del cliente)
export async function POST(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { phone } = await params
    const { body: text } = await req.json()
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 })
    }
    if (text.length > 4096) {
      return NextResponse.json({ error: 'El mensaje excede 4096 caracteres' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Formato E.164 sin "+" para el envío — el número de la BD es local (10 dígitos)
    const toWhatsApp = phone.length === 10 ? `52${phone}` : phone
    const result = await sendWhatsAppText(toWhatsApp, text.trim())

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    const { data: contact } = await supabase.from('contacts').select('id').eq('phone', phone).maybeSingle()

    const { data, error } = await supabase
      .from('whatsapp_messages')
      .insert([{
        contact_id: contact?.id ?? null,
        phone,
        direction: 'outbound',
        body: text.trim(),
        wa_message_id: result.messageId,
        status: 'sent',
        user_id: uid,
      }])
      .select()
    if (error) throw error

    return NextResponse.json({ message: data?.[0] })
  } catch (error: any) {
    console.error('[POST /api/whatsapp/conversations/[phone]]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al enviar el mensaje' }, { status: 500 })
  }
}
