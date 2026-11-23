import { getDashboardWhatsAppUsage } from '@/lib/dashboardWhatsApp'
import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'
import { storeDays, teamActivities } from '@/lib/storeActivity'
import { activityClient, liveContactIds } from '@/lib/commercialServer'
import {
  KIND_LABELS, NO_ANSWER_LIMIT, RESULT_RULES, addDays, countActivities, isCallResult, previousSameDays, resultLabel,
  startOfMonth as startOfMonthDay, type ActivityKind, type CommercialStatus,
} from '@/lib/commercial'

const DAY = 24 * 60 * 60 * 1000

type QueueRow = {
  id: string; name: string; company: string | null
  commercial_status: CommercialStatus; next_action: string | null; next_action_at: string | null
  last_activity_at?: string | null
}
/**
 * Cola y próximos calculados en la base (función dashboard_queue), con la
 * misma regla que Comercial › Hoy: count = Pendientes, fresh = Nuevos.
 */
type QueueSummary = { count: number; overdue: number; fresh: number; top: QueueRow[]; upcoming: QueueRow[] }
type Facets = { total: number; segment: Record<string, number> }
type ActivityRow = {
  id: string; contact_id: string | null; contact_name: string | null; user_id: string | null; kind: ActivityKind; result: string | null; note: string | null
  quote_amount: number | null; sale_amount: number | null; is_followup: boolean; created_at: string
}

const bizName = (c: { company: string | null; name: string }) => c.company?.trim() || c.name

async function GETImpl(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { isAdmin, storeId } = ctx

  try {
    const supabase = getServerSupabase()
    // Días de la tienda. Los instantes sirven también para las columnas `timestamp`
    // sin zona que guardan hora UTC (contacts.created_at): Postgres ignora la "Z".
    const calendar = storeDays(ctx)
    const today = calendar.today
    const startOfToday = calendar.startOf(today)
    const startOfMonth = calendar.monthStart(0)
    // Las tendencias comparan el mes en curso contra los MISMOS días del mes
    // pasado (del 1 al día de hoy), igual que Reportes › Desempeño
    const prevDays = previousSameDays('month', startOfMonthDay(today), today)
    const prevFrom = calendar.startOf(prevDays.from)
    const prevTo = calendar.startOf(addDays(prevDays.to, 1))
    const since14d = Date.now() - 14 * DAY
    const since30d = Date.now() - 30 * DAY
    // Lo más viejo que se necesita: el mes pasado o 30 días (marzo: febrero tiene 28)
    const activitiesFrom = new Date(Math.min(Date.parse(prevFrom), since30d)).toISOString()

    const contactsCount = () => supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('store_id', storeId)

    const [
      facetsRes,
      { count: contactsThisMonth },
      { count: contactsLastMonth },
      queueRes,
      activities,
      { count: waUnread },
      { count: waInboundToday },
      waUsage,
      names,
    ] = await Promise.all([
      // Total y conteo por segmento de toda la base, en una pasada dentro de la base
      // (antes se descargaba la columna de todos los contactos, de 1,000 en 1,000)
      supabase.rpc('contact_facets', { p_store: storeId }),
      contactsCount().gte('created_at', startOfMonth),
      contactsCount().gte('created_at', prevFrom).lt('created_at', prevTo),
      // Mi cola con la regla de Comercial › Hoy (míos y sin asignar); la base cuenta y elige las filas
      supabase.rpc('dashboard_queue', {
        p_store: storeId, p_uid: ctx.uid, p_unowned: true, p_today: today, p_no_answer_limit: NO_ANSWER_LIMIT,
      }),
      // Actividad comercial desde el mes pasado: toda la tienda sin cuentas de prueba
      // (administrador) o la propia (vendedor)
      teamActivities<ActivityRow>(ctx, {
        columns: 'id, contact_id, contact_name, user_id, kind, result, note, quote_amount, sale_amount, is_followup, created_at',
        range: { from: activitiesFrom }, scope: isAdmin ? 'store' : 'mine', newestFirst: true,
      }),
      supabase.from('whatsapp_threads').select('phone', { count: 'exact', head: true }).eq('store_id', storeId).gt('unread', 0),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('store_id', storeId).is('archived_number', null).eq('direction', 'inbound').gte('created_at', startOfToday),
      req.nextUrl.searchParams.get('includeWhatsApp') !== '0' && isAdmin && ctx.modules.whatsapp ? getDashboardWhatsAppUsage(storeId) : Promise.resolve(null),
      isAdmin ? getUserNameMap(storeId).catch(() => new Map<string, string>()) : Promise.resolve(null),
    ])

    if (facetsRes.error) throw facetsRes.error
    if (queueRes.error) throw queueRes.error
    const facets = facetsRes.data as Facets
    const totalContacts = facets?.total ?? 0

    // ── Cola de hoy y próximos seguimientos ────────────────────────────────
    const queue = { fresh: 0, ...(queueRes.data ?? { count: 0, overdue: 0, top: [], upcoming: [] }) } as QueueSummary
    const overdue = queue.overdue
    const upcoming = queue.upcoming

    // ── Mes en curso contra los mismos días del mes pasado ──────────────────
    const at = (a: ActivityRow) => Date.parse(a.created_at)
    const monthFrom = Date.parse(startOfMonth)
    const thisMonth = countActivities(activities.filter(a => at(a) >= monthFrom))
    const lastMonth = countActivities(activities.filter(a => at(a) >= Date.parse(prevFrom) && at(a) < Date.parse(prevTo)))

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
    const bySegment = Object.entries(facets?.segment ?? {}).map(([name, count]) => ({ name, count: Number(count) }))
      .sort((a, b) => b.count - a.count)

    // ── Actividad reciente (14 días) ────────────────────────────────────────
    const recent = activities.filter(a => at(a) >= since14d).slice(0, 8)
    const ids = liveContactIds(recent)
    const { data: recentContacts } = ids.length
      ? await supabase.from('contacts').select('id, name, company').eq('store_id', storeId).in('id', ids)
      : { data: [] as { id: string; name: string; company: string | null }[] }
    const contactName = new Map((recentContacts ?? []).map(c => [c.id, bizName(c)]))
    const activity = recent.map(a => ({
      // Sin contactId si el contacto se borró: la actividad se ve, pero no abre ficha
      id: a.id, type: a.result === 'venta' ? 'close' : a.kind, contactId: a.contact_id,
      contactName: activityClient(a, contactName),
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
        queueToday:       queue.count,
        // Prospectos sin trabajar (Comercial › Hoy › Nuevos): aparte, no son «para llamar hoy»
        freshCount:       queue.fresh,
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
        count: queue.count,
        contacts: queue.top.map(c => ({
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
      // Hoy en la tienda (para las etiquetas «Hoy / Vencido» del navegador)
      today,
    })
  } catch (error) {
    return serverError('GET /api/data/dashboard', error, 'Error al obtener métricas')
  }
}

export const GET = withServerTiming(GETImpl)
