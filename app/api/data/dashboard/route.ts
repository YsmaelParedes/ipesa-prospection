import { NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireUser } from '@/lib/supabase-server'
import { ownLeadsFilter } from '@/lib/leads'
import { serverError } from '@/lib/validation'
import { CAMPAIGN_DAILY_LIMIT } from '@/lib/whatsappSafety'

const WON = 'Ganado / Venta realizada'
const ACTIVE_STATES = ['Nuevo', 'En seguimiento', 'Cotizado']

/**
 * Inicio de día/mes en México (UTC-6 todo el año desde 2022) como instante
 * UTC. Sirve tanto para columnas timestamptz como para las `timestamp` sin
 * zona que guardan hora UTC (contacts.created_at): Postgres ignora la "Z".
 */
function mexicoBoundaries() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map(p => [p.type, p.value]),
  )
  const y = Number(parts.year), m = Number(parts.month) - 1, d = Number(parts.day)
  const at = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, 6)).toISOString()
  return {
    startOfToday:     at(y, m, d),
    startOfMonth:     at(y, m, 1),
    startOfLastMonth: at(y, m - 1, 1),
  }
}

export async function GET() {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx
  const isAdmin = ctx.role === 'admin'

  try {
    const supabase = getServerSupabase()
    const { startOfToday, startOfMonth, startOfLastMonth } = mexicoBoundaries()
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Admin: leads de todos (supervisión). Empleado: solo los suyos (+ legacy).
    let leadsQuery = supabase.from('leads').select('id, name, canal, estado, fecha, created_at, user_id').order('created_at', { ascending: false })
    if (!isAdmin) leadsQuery = leadsQuery.or(ownLeadsFilter(ctx.uid))

    const contactsCount = () => supabase.from('contacts').select('id', { count: 'exact', head: true })

    const [
      { count: totalContacts },
      { count: contactsThisMonth },
      { count: contactsLastMonth },
      { data: leadsData, error: leadsError },
      { data: segmentsData },
      { count: waUnread },
      { count: waInboundToday },
      { count: waTemplates24h },
      names,
    ] = await Promise.all([
      contactsCount(),
      contactsCount().gte('created_at', startOfMonth),
      contactsCount().gte('created_at', startOfLastMonth).lt('created_at', startOfMonth),
      leadsQuery,
      supabase.from('contacts').select('segment'),
      supabase.from('whatsapp_conversations').select('phone', { count: 'exact', head: true }).gt('unread', 0),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', startOfToday),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true })
        .eq('direction', 'outbound').not('template_name', 'is', null).neq('status', 'failed').gte('created_at', since24h),
      isAdmin ? getUserNameMap().catch(() => new Map<string, string>()) : Promise.resolve(null),
    ])
    if (leadsError) throw leadsError

    const leads = leadsData ?? []
    const inRange = (iso: string, from: string, to?: string) => iso >= from && (!to || iso < to)
    const thisMonth = leads.filter(l => inRange(new Date(l.created_at).toISOString(), startOfMonth))
    const lastMonth = leads.filter(l => inRange(new Date(l.created_at).toISOString(), startOfLastMonth, startOfMonth))
    const won = (list: typeof leads) => list.filter(l => l.estado === WON).length
    const rate = (list: typeof leads) => list.length ? Math.round((won(list) / list.length) * 100) : 0

    // ── Desglose por vendedor (solo admin) ──────────────────────────────────
    let byOwner: { name: string; count: number }[] = []
    if (names) {
      const counts: Record<string, number> = {}
      for (const l of leads) {
        const name = l.user_id ? (names.get(l.user_id) ?? 'Usuario') : 'Sin asignar'
        counts[name] = (counts[name] || 0) + 1
      }
      byOwner = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    }

    // ── Canal (últimos 30 días) ─────────────────────────────────────────────
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const channelCounts: Record<string, number> = {}
    for (const l of leads) {
      if (new Date(l.created_at).getTime() < thirtyDaysAgo) continue
      const ch = l.canal || 'Otro'
      channelCounts[ch] = (channelCounts[ch] || 0) + 1
    }
    const byChannel = Object.entries(channelCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)

    // ── Segmento (contactos globales) ───────────────────────────────────────
    const segmentCounts: Record<string, number> = {}
    for (const c of segmentsData ?? []) {
      if (c.segment) segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1
    }
    const bySegment = Object.entries(segmentCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

    // ── Leads recientes + actividad de hoy ──────────────────────────────────
    const recentLeads = leads.slice(0, 6).map(l => ({
      id: l.id, name: l.name, canal: l.canal, estado: l.estado,
      fecha: l.fecha || String(l.created_at).slice(0, 10),
    }))
    const todayLeads = leads.filter(l => new Date(l.created_at).toISOString() >= startOfToday)
    const activity = [
      ...todayLeads.filter(l => l.estado === WON).map(l => ({ id: l.id, type: 'close', who: l.name, what: 'cerró como cliente', time: 'hoy', color: '#3D8B5C' })),
      ...todayLeads.filter(l => l.estado !== WON).map(l => ({ id: l.id, type: 'lead', who: l.name, what: `nuevo lead · ${l.canal}`, time: 'hoy', color: '#EE5A24' })),
    ].slice(0, 8)

    return NextResponse.json({
      metrics: {
        totalContacts: totalContacts || 0,
        leadsActivos:  leads.filter(l => ACTIVE_STATES.includes(l.estado)).length,
        cierresMes:    won(thisMonth),
        conversion:    leads.length ? Math.round((won(leads) / leads.length) * 100) : 0,
      },
      // Comparativo real mes actual vs mes anterior (antes eran porcentajes fijos)
      trends: {
        contacts:   { current: contactsThisMonth || 0, previous: contactsLastMonth || 0 },
        leads:      { current: thisMonth.length,       previous: lastMonth.length },
        wins:       { current: won(thisMonth),         previous: won(lastMonth) },
        conversion: { current: rate(thisMonth),        previous: rate(lastMonth) },
      },
      whatsapp: {
        unreadConversations: waUnread || 0,
        inboundToday:        waInboundToday || 0,
        templates24h:        waTemplates24h || 0,
        dailyLimit:          CAMPAIGN_DAILY_LIMIT,
      },
      byChannel,
      bySegment,
      byOwner,
      recentLeads,
      activity,
      isAdmin,
    })
  } catch (error) {
    return serverError('GET /api/data/dashboard', error, 'Error al obtener métricas')
  }
}
