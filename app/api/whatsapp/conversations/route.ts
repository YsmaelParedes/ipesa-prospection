import { NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// GET /api/whatsapp/conversations — lista una fila por número de teléfono,
// con el último mensaje y el conteo de mensajes entrantes sin leer.
export async function GET() {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()

    const [{ data: messages, error }, { data: contacts }] = await Promise.all([
      supabase
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('contacts').select('id, name, phone'),
    ])
    if (error) throw error

    const nameByPhone = new Map((contacts ?? []).map(c => [c.phone, c.name]))

    const byPhone = new Map<string, any>()
    for (const m of messages ?? []) {
      if (!byPhone.has(m.phone)) {
        byPhone.set(m.phone, {
          phone: m.phone,
          name: nameByPhone.get(m.phone) ?? null,
          lastMessage: m.body,
          lastDirection: m.direction,
          lastAt: m.created_at,
          unread: 0,
        })
      }
      if (m.direction === 'inbound' && !m.read_at) {
        byPhone.get(m.phone).unread++
      }
    }

    const conversations = Array.from(byPhone.values())
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())

    return NextResponse.json({ conversations })
  } catch (error: any) {
    console.error('[GET /api/whatsapp/conversations]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener conversaciones' }, { status: 500 })
  }
}
