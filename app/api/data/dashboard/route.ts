import { getDashboardWhatsAppUsage } from '@/lib/dashboardWhatsApp'
import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { hasSalesTeam } from '@/lib/commercialServer'
import {
  KIND_LABELS, RESULT_RULES, bucketOf, countActivities, inQueue, isCallResult, queueCompare, resultLabel, todayISO,
  type ActivityKind, type CommercialStatus,
} from '@/lib/commercial'

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

type QueueRow = {
  id: string; name: string; company: string | null; address: string | null; owner_id: string | null
  commercial_status: CommercialStatus; next_action: string | null; next_action_at: string | null
  last_activity_at: string | null; no_answer_streak: number; created_at: string
}
type ActivityRow = {
  id: string; contact_id: string; user_id: string | null; kind: ActivityKind; result: string | null; note: string | null
  quote_amount: number | null; sale_amount: number | null; is_followup: boolean; created_at: string
}

const bizName = (c: { company: string | null; name: string }) => c.company?.trim() || c.name

async function GETImpl(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { isAdmin, storeId } = ctx

  try {
    const supabase = getServerSupabase()
    const { startOfToday, startOfMonth, startOfLastMonth } = mexicoBoundaries()
    const since14d = Date.now() - 14 * DAY
    const since30d = Date.now() - 30 * DAY
    const today = todayISO(ctx.store.timezone)
    const salesTeam = hasSalesTeam(ctx)

    const contactsCount = () => supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('store_id', storeId)

    const [
      { count: totalContacts },
      { count: contactsThisMonth },
      { count: contactsLastMonth },
      { data: segmentsData },
      mine,
      activities,
      { count: waUnread },
      { count: waInboundToday },
      waUsage,
      names,
    ] = await Promise.all([
      contactsCount(),
      contactsCount().gte('created_at', startOfMonth),
      contactsCount().gte('created_at', startOfLastMonth).lt('created_at', startOfMonth),
      supabase.from('contacts').select('segment').eq('store_id', storeId),
      // Mi cola: los míos (y, sin reparto, los que no tienen responsable)
      fetchPaged<QueueRow>((from, to) => {
        const q = supabase.from('contacts')
          .select('id, name, company, address, owner_id, commercial_status, next_action, next_action_at, last_activity_at, no_answer_streak, created_at')
          .eq('store_id', storeId)
        return (isAdmin && !salesTeam ? q.or(`owner_id.eq.${ctx.uid},owner_id.is.null`) : q.eq('owner_id', ctx.uid))
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
      }, 100000),
      // Actividad comercial desde el mes pasado: toda la tienda (dueño/admin) o la propia (vendedor)
      fetchPaged<ActivityRow>((from, to) => {
        let q = supabase.from('commercial_activities')
          .select('id, contact_id, user_id, kind, result, note, quote_amount, sale_amount, is_followup, created_at')
          .eq('store_id', storeId).gte('created_at', startOfLastMonth)
        if (!isAdmin) q = q.eq('user_id', ctx.uid)
        return q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
      }, 100000),
      supabase.from('whatsapp_threads').select('phone', { count: 'exact', head: true }).eq('store_id', storeId).gt('unread', 0),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('direction', 'inbound').gte('created_at', startOfToday),
      req.nextUrl.searchParams.get('includeWhatsApp') !== '0' && isAdmin && ctx.modules.whatsapp ? getDashboardWhatsAppUsage(storeId) : Promise.resolve(null),
      isAdmin ? getUserNameMap(storeId).catch(() => new Map<string, string>()) : Promise.resolve(null),
    ])

    // ── Cola de hoy y próximos seguimientos ────────────────────────────────
    const queue = mine.filter(c => inQueue(bucketOf(c, today))).sort(queueCompare(today))
    const overdue = queue.filter(c => c.next_action_at && c.next_action_at < today).length
    const upcoming = mine.filter(c => bucketOf(c, today) === 'programado')
      .sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at))).slice(0, 6)

    // ── Mes actual contra el anterior ───────────────────────────────────────
    const at = (a: ActivityRow) => Date.parse(a.created_at)
    const monthFrom = Date.parse(startOfMonth)
    const thisMonth = countActivities(activities.filter(a => at(a) >= monthFrom))
    const lastMonth = countActivities(activities.filter(a => at(a) < monthFrom))

    // ── Resultados de llamadas y llamadas por vendedor (30 días) ────────────
    const last30 = activities.filter(a => at(a) >= since30d && a.kind !== 'nota')
    const resultCounts = new Map<string, number>()
    for (const a of last30) if (a.result) resultCounts.set(a.result, (resultCounts.get(a.result) ?? 0) + 1)
    const byResult = Array.from(resultCounts, ([key, count]) => ({ key, name: resultLabel(key), count }))
      .filter(r => isCallResult(r.key)).sort((a, b) => b.count - a.count)

    let byOwner: { name: string; count: number }[] = []
    if (names) {
      const counts: Record<string, number> = {}
      for (const a of last30) {
        const name = a.user_id ? (names.get(a.user_id) ?? 'Usuario') : 'Sin usuario'
        counts[name] = (counts[name] || 0) + 1
      }
      byOwner = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    }

    // ── Segmento (contactos de la tienda) ───────────────────────────────────
    const segmentCounts: Record<string, number> = {}
    for (const c of segmentsData ?? []) {
      if (c.segment) segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1
    }
    const bySegment = Object.entries(segmentCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

    // ── Actividad reciente (14 días) ────────────────────────────────────────
    const recent = activities.filter(a => at(a) >= since14d).slice(0, 8)
    const ids = Array.from(new Set(recent.map(a => a.contact_id)))
    const { data: recentContacts } = ids.length
      ? await supabase.from('contacts').select('id, name, company').eq('store_id', storeId).in('id', ids)
      : { data: [] as { id: string; name: string; company: string | null }[] }
    const contactName = new Map((recentContacts ?? []).map(c => [c.id, bizName(c)]))
    const activity = recent.map(a => ({
      id: a.id, type: a.result === 'venta' ? 'close' : a.kind, contactId: a.contact_id,
      contactName: contactName.get(a.contact_id) ?? 'Contacto',
      title: [KIND_LABELS[a.kind] ?? 'Actividad', a.result && isCallResult(a.result) ? RESULT_RULES[a.result].label : ''].filter(Boolean).join(' · '),
      text: a.note ? a.note.slice(0, 120) : '',
      amount: a.sale_amount ?? a.quote_amount,
      at: a.created_at,
      who: names && a.user_id ? (names.get(a.user_id) ?? null) : null,
    }))

    return NextResponse.json({
      metrics: {
        totalContacts:    totalContacts || 0,
        newContactsMonth: contactsThisMonth || 0,
        queueToday:       queue.length,
        overdue,
        quotesMonth:      thisMonth.quotes,
        quotedMonth:      thisMonth.quoted,
        salesMonth:       thisMonth.sales,
        soldMonth:        thisMonth.sold,
      },
      // Comparativo real mes actual vs mes anterior
      trends: {
        contacts: { current: contactsThisMonth || 0, previous: contactsLastMonth || 0 },
        sales:    { current: thisMonth.sales,        previous: lastMonth.sales },
        sold:     { current: thisMonth.sold,         previous: lastMonth.sold },
      },
      queue: {
        count: queue.length,
        contacts: queue.slice(0, 5).map(c => ({
          id: c.id, name: bizName(c), status: c.commercial_status, next_action: c.next_action, next_action_at: c.next_action_at,
          overdue: !!c.next_action_at && c.next_action_at < today, fresh: !c.last_activity_at,
        })),
      },
      upcoming: upcoming.map(c => ({ id: c.id, name: bizName(c), status: c.commercial_status, next_action: c.next_action, next_action_at: c.next_action_at })),
      whatsapp: {
        unreadConversations: waUnread || 0,
        inboundToday:        waInboundToday || 0,
        people24h:           waUsage?.used ?? 0,
        dailyLimit:          waUsage?.limit ?? null,
      },
      byResult,
      bySegment,
      byOwner,
      activity,
      isAdmin,
    })
  } catch (error) {
    return serverError('GET /api/data/dashboard', error, 'Error al obtener métricas')
  }
}

export const GET = withServerTiming(GETImpl)
