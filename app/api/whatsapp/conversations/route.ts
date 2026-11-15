import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { contactsForPhones } from '@/lib/whatsappInbox'
import { noWhatsAppAmong } from '@/lib/campaignPeople'
import type { ConversationSummary } from '@/lib/whatsappThreadTypes'
import { isWindowOpen } from '@/lib/whatsappSafety'
import { serverError } from '@/lib/validation'
import { searchWords } from '@/lib/contactSearch'

const PAGE = 100

/**
 * GET /api/whatsapp/conversations?filter=all|unread|unknown&q=texto&before=ISO
 * Una fila por número de la tienda (vista whatsapp_threads), con el contacto del
 * CRM vinculado, no leídos, estado de la ventana de 24 h y si Meta reportó que
 * el número no tiene WhatsApp.
 * El filtro y la búsqueda se hacen en la base sobre TODOS los chats
 * (whatsapp_thread_list), sin acentos ni mayúsculas, como en Contactos.
 */
async function GETImpl(req: NextRequest) {
  const ctx = await requireStore({ module: 'whatsapp' })
  if (ctx instanceof Response) return ctx

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
  const q      = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60)
  const before = req.nextUrl.searchParams.get('before')
  // Solo números (3 o más): busca en el teléfono; si no, palabra por palabra
  const digits = q.replace(/\D/g, '')
  const byPhone = digits.length >= 3 && !/[a-zA-ZÀ-ſ]/.test(q)

  try {
    const { data, error } = await getServerSupabase().rpc('whatsapp_thread_list', {
      p_store: ctx.storeId,
      p_unread: filter === 'unread',
      p_unknown: filter === 'unknown',
      p_words: byPhone ? [] : searchWords(q),
      p_digits: byPhone ? digits : null,
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: PAGE + 1,
    })
    if (error) throw error
    const rows = (data ?? []) as Record<string, any>[]

    const contacts = await contactsForPhones(
      ctx.storeId,
      rows.map(r => r.phone),
      rows.map(r => r.contact_id).filter(Boolean),
    )

    const conversations = rows.map((r): ConversationSummary => {
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

    const hasMore = conversations.length > PAGE
    const page = conversations.slice(0, PAGE)
    // Solo puede ser "sin WhatsApp" si lo último fue un envío nuestro que no se entregó
    const noWhatsApp = await noWhatsAppAmong(ctx.storeId,
      page.filter(c => c.lastDirection === 'outbound' && c.lastStatus !== 'delivered' && c.lastStatus !== 'read').map(c => c.phone))
    return NextResponse.json({ conversations: page.map(c => ({ ...c, noWhatsApp: noWhatsApp.has(c.phone) })), hasMore })
  } catch (error) {
    return serverError('GET /api/whatsapp/conversations', error, 'Error al obtener conversaciones')
  }
}

export const GET = withServerTiming(GETImpl)
