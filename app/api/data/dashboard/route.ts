import { NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { ownLeadsFilter } from '@/lib/leads'
import { WON, isOpenLead } from '@/lib/crm'
import { serverError } from '@/lib/validation'
import { CAMPAIGN_DAILY_LIMIT } from '@/lib/whatsappSafety'

const ACTIVITY_LABELS: Record<string, string> = {
  call: 'Llamada', email: 'Correo', whatsapp: 'WhatsApp', quote: 'Cotización',
  meeting: 'Reunión', visit: 'Visita', note: 'Nota',
}
const DAY = 24 * 60 * 60 * 1000

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
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { isAdmin, storeId } = ctx

  try {
    const supabase = getServerSupabase()
    const { startOfToday, startOfMonth, startOfLastMonth } = mexicoBoundaries()
    const since24h = new Date(Date.now() - DAY).toISOString()
    const since14d = new Date(Date.now() - 14 * DAY).toISOString()

    // Admin: leads de toda la tienda (supervisión). Vendedor: solo los suyos (+ legacy).
    let leadsQuery = supabase.from('leads').select('id, name, canal, estado, monto, fecha, created_at, user_id')
      .eq('store_id', storeId).order('created_at', { ascending: false })
    if (!isAdmin) leadsQuery = leadsQuery.or(ownLeadsFilter(ctx.uid))

    // Actividades registradas (llamadas, cotizaciones, visitas…) de las últimas 2 semanas
    let activitiesQuery = supabase.from('lead_activities').select('id, lead_id, type, description, amount, activity_date, user_id')
      .eq('store_id', storeId).gte('activity_date', since14d).order('activity_date', { ascending: false }).limit(12)
    if (!isAdmin) activitiesQuery = activitiesQuery.eq('user_id', ctx.uid)

    const contactsCount = () => supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('store_id', storeId)

    const [
      { count: totalContacts },
      { count: contactsThisMonth },
      { count: contactsLastMonth },
      { data: leadsData, error: leadsError },
      { data: segmentsData },
      { data: pendingReminders },
      { data: activitiesData },
      { count: waUnread },
      { count: waInboundToday },
      { count: waTemplates24h },
      names,
    ] = await Promise.all([
      contactsCount(),
      contactsCount().gte('created_at', startOfMonth),
      contactsCount().gte('created_at', startOfLastMonth).lt('created_at', startOfMonth),
      leadsQuery,
      supabase.from('contacts').select('segment').eq('store_id', storeId),
      // Leads con un seguimiento ya programado (de cualquier persona del equipo)
      supabase.from('reminders').select('lead_id').eq('store_id', storeId).eq('completado', false).not('lead_id', 'is', null),
      activitiesQuery,
      supabase.from('whatsapp_threads').select('phone', { count: 'exact', head: true }).eq('store_id', storeId).gt('unread', 0),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('direction', 'inbound').gte('created_at', startOfToday),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('store_id', storeId)
        .eq('direction', 'outbound').not('template_name', 'is', null).neq('status', 'failed').gte('created_at', since24h),
      isAdmin ? getUserNameMap(storeId).catch(() => new Map<string, string>()) : Promise.resolve(null),
    ])
    if (leadsError) throw leadsError

    const leads = leadsData ?? []
    const inRange = (iso: string, from: string, to?: string) => iso >= from && (!to || iso < to)
    const thisMonth = leads.filter(l => inRange(new Date(l.created_at).toISOString(), startOfMonth))
    const lastMonth = leads.filter(l => inRange(new Date(l.created_at).toISOString(), startOfLastMonth, startOfMonth))
    const won = (list: typeof leads) => list.filter(l => l.estado === WON).length
    const rate = (list: typeof leads) => list.length ? Math.round((won(list) / list.length) * 100) : 0
    const openLeads = leads.filter(l => isOpenLead(l.estado))

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
    const thirtyDaysAgo = Date.now() - 30 * DAY
    const channelCounts: Record<string, number> = {}
    for (const l of leads) {
      if (new Date(l.created_at).getTime() < thirtyDaysAgo) continue
      const ch = l.canal || 'Otro'
      channelCounts[ch] = (channelCounts[ch] || 0) + 1
    }
    const byChannel = Object.entries(channelCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8)

    // ── Segmento (contactos de la tienda) ───────────────────────────────────
    const segmentCounts: Record<string, number> = {}
    for (const c of segmentsData ?? []) {
      if (c.segment) segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1
    }
    const bySegment = Object.entries(segmentCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

    // ── Leads abiertos sin seguimiento programado ───────────────────────────
    const withFollowUp = new Set((pendingReminders ?? []).map(r => r.lead_id as string))
    const unscheduled = openLeads.filter(l => !withFollowUp.has(l.id))

    // ── Leads recientes + actividad real del equipo ─────────────────────────
    const recentLeads = leads.slice(0, 6).map(l => ({
      id: l.id, name: l.name, canal: l.canal, estado: l.estado,
      fecha: l.fecha || String(l.created_at).slice(0, 10),
    }))
    const leadNames = new Map(leads.map(l => [l.id, l.name]))
    const activity = [
      ...(activitiesData ?? []).map(a => ({
        id: `a-${a.id}`, type: a.type as string, leadId: a.lead_id as string | null,
        leadName: (a.lead_id && leadNames.get(a.lead_id)) || 'Lead',
        title: ACTIVITY_LABELS[a.type] ?? 'Actividad',
        text: a.description ? String(a.description).slice(0, 120) : '',
        amount: a.amount as number | null,
        at: a.activity_date as string,
        who: names && a.user_id ? (names.get(a.user_id) ?? null) : null,
      })),
      ...leads.filter(l => new Date(l.created_at).toISOString() >= since14d).map(l => ({
        id: `l-${l.id}`, type: l.estado === WON ? 'close' : 'lead', leadId: l.id as string | null, leadName: l.name as string,
        title: l.estado === WON ? 'Venta ganada' : 'Nuevo lead', text: l.canal ? `Llegó por ${l.canal}` : '',
        amount: (l.estado === WON ? l.monto : null) as number | null,
        at: new Date(l.created_at).toISOString(),
        who: names && l.user_id ? (names.get(l.user_id) ?? null) : null,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)

    return NextResponse.json({
      metrics: {
        totalContacts:     totalContacts || 0,
        newContactsMonth:  contactsThisMonth || 0,
        leadsActivos:      openLeads.length,
        openValue:         openLeads.reduce((s, l) => s + (Number(l.monto) || 0), 0),
        cierresMes:        won(thisMonth),
        conversion:        leads.length ? Math.round((won(leads) / leads.length) * 100) : 0,
      },
      // Comparativo real mes actual vs mes anterior
      trends: {
        contacts:   { current: contactsThisMonth || 0, previous: contactsLastMonth || 0 },
        leads:      { current: thisMonth.length,       previous: lastMonth.length },
        wins:       { current: won(thisMonth),         previous: won(lastMonth) },
        conversion: { current: rate(thisMonth),        previous: rate(lastMonth) },
      },
      followUp: {
        count: unscheduled.length,
        leads: unscheduled.slice(0, 5).map(l => ({ id: l.id, name: l.name, estado: l.estado, monto: l.monto })),
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
