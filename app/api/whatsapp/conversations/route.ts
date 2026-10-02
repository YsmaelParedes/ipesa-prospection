import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { contactsForPhones } from '@/lib/whatsappInbox'
import { isWindowOpen } from '@/lib/whatsappSafety'
import { serverError } from '@/lib/validation'

const PAGE = 100

/**
 * GET /api/whatsapp/conversations?filter=all|unread|unknown&q=texto&before=ISO
 * Una fila por número (vista whatsapp_conversations), con el contacto del
 * CRM vinculado, no leídos y estado de la ventana de 24 h.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
  const q      = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 60)
  const before = req.nextUrl.searchParams.get('before')

  try {
    let query = getServerSupabase()
      .from('whatsapp_conversations')
      .select('*')
      .order('last_at', { ascending: false })
      // Con búsqueda se filtra en memoria sobre un rango mayor
      .limit(q ? 1000 : PAGE + 1)
    if (filter === 'unread') query = query.gt('unread', 0)
    if (before && !Number.isNaN(Date.parse(before))) query = query.lt('last_at', before)

    const { data, error } = await query
    if (error) throw error
    const rows = data ?? []

    const contacts = await contactsForPhones(
      rows.map(r => r.phone),
      rows.map(r => r.contact_id).filter(Boolean),
    )

    let conversations = rows.map(r => {
      const contact = contacts.get(r.phone)
      return {
        phone:         r.phone as string,
        contactId:     contact?.id ?? null,
        name:          contact?.name ?? null,
        profileName:   r.profile_name as string | null,
        segment:       contact?.segment ?? null,
        optOut:        contact?.wa_opt_out ?? false,
        lastBody:      r.last_body as string | null,
        lastDirection: r.last_direction as 'inbound' | 'outbound',
        lastStatus:    r.last_status as string,
        lastMediaType: r.last_media_type as string | null,
        lastTemplate:  r.last_template as string | null,
        lastAt:        r.last_at as string,
        unread:        r.unread as number,
        lastInboundAt: r.last_inbound_at as string | null,
        windowOpen:    isWindowOpen(r.last_inbound_at),
      }
    })

    if (filter === 'unknown') conversations = conversations.filter(c => !c.contactId)
    if (q) {
      const digits = q.replace(/\D/g, '')
      conversations = conversations.filter(c =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.profileName ?? '').toLowerCase().includes(q) ||
        (digits.length >= 3 && c.phone.includes(digits)))
    }

    const hasMore = conversations.length > PAGE
    return NextResponse.json({ conversations: conversations.slice(0, PAGE), hasMore })
  } catch (error) {
    return serverError('GET /api/whatsapp/conversations', error, 'Error al obtener conversaciones')
  }
}
