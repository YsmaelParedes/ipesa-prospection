import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, getTestUserIds, requireStore } from '@/lib/supabase-server'
import { storeDays } from '@/lib/storeActivity'
import { jsonError, serverError } from '@/lib/validation'
import { quoteOutcomes, storeGoals } from '@/lib/commercialServer'
import { firstSaleCount, contactPlaces, placeOptions, rank, reportActivities } from '@/lib/reportsServer'
import { bucketFor, bucketLabel, bucketStart, parseFilters, rangeDays, resolveRange } from '@/lib/reports'
import { dayInZone } from '@/lib/datetime'
import {
  GOAL_KEYS, addDays, compliance, countActivities, goalsFor, workDaysBetween, type ActivityForCount, type Goals,
} from '@/lib/commercial'

type Row = ActivityForCount & { id: string; contact_id: string | null; user_id: string | null; created_at: string }

/** Meta del periodo: la meta diaria por los días hábiles transcurridos. */
const scale = (goals: Goals, days: number): Goals =>
  Object.fromEntries(GOAL_KEYS.map(k => [k, goals[k] * days])) as Goals

/**
 * GET /api/data/commercial/summary?period=&from=&to=&sellers=&zone=&segment=
 * — Reportes › Desempeño (y Mi avance del vendedor): totales del periodo, los
 * mismos días del periodo anterior para comparar, avance contra la meta, el
 * desglose por vendedor y lo que piden las gráficas (vendido día por día,
 * actividad por día, semana o mes, y vendido por zona y segmento).
 *
 * Administrador: todo el equipo sin cuentas de prueba. Vendedor: solo lo suyo,
 * con sus cotizaciones abiertas. Los filtros se leen con parseFilters (lib/reports).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ feature: 'reports' })
  if (ctx instanceof Response) return ctx

  const f = parseFilters(req.nextUrl.searchParams)
  const calendar = storeDays(ctx)
  const today = calendar.today
  const range = resolveRange(f, today)
  if (!range) return jsonError('Elige un rango de fechas válido, de hasta un año')
  const { from, to, end, prevFrom, prevEnd } = range

  const startedDays = workDaysBetween(from, end)
  const fullDays = workDaysBetween(from, to)
  // Un día se mide contra la meta diaria (aunque sea domingo). Un periodo que
  // empieza en domingo aún no tiene días hábiles: se mide contra el completo
  const oneDay = from === to
  const goalDays = oneDay ? 1 : startedDays || fullDays
  const prevGoalDays = oneDay ? 1 : workDaysBetween(prevFrom, prevEnd) || 1

  try {
    const [rows, members, store, tests, options] = await Promise.all([
      // Desde el periodo anterior: la línea del anterior llega hasta el día antes de este
      reportActivities<Row>(ctx, f, {
        columns: 'id, contact_id, user_id, kind, result, is_followup, quote_amount, sale_amount, created_at',
        range: calendar.days(prevFrom, end),
      }),
      getStoreMembers(ctx.storeId).catch(() => []),
      getServerSupabase().from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      getTestUserIds(ctx.storeId),
      placeOptions(ctx),
    ])
    if (store.error) throw store.error

    const tz = calendar.timeZone
    const dayOf = new Map(rows.map(r => [r.id, dayInZone(r.created_at, tz)]))
    const current = rows.filter(r => dayOf.get(r.id)! >= from)
    const previous = rows.filter(r => dayOf.get(r.id)! <= prevEnd)

    // Vendedores: el administrador ve a quien vende (o a los elegidos); el vendedor, a sí mismo
    const cfg = storeGoals(ctx, store.data?.commercial_goals)
    const chosen = ctx.isAdmin && f.sellers.length ? new Set(f.sellers) : null
    const team = members.filter(m => m.status === 'active' && !tests.has(m.user_id))
    const people = team
      .filter(m => ctx.isAdmin ? (!chosen || chosen.has(m.user_id)) : m.user_id === ctx.uid)
      .filter(m => !ctx.isAdmin || chosen || m.role === 'employee' || current.some(r => r.user_id === m.user_id))
      .map(m => {
        const goals = goalsFor(cfg, m.user_id)
        const counts = countActivities(current.filter(r => r.user_id === m.user_id))
        const before = countActivities(previous.filter(r => r.user_id === m.user_id))
        return {
          user_id: m.user_id, name: m.display_name, custom: !!cfg.byUser[m.user_id],
          counts, prev: before, goals: scale(goals, goalDays),
          compliance: compliance(counts, goals, goalDays), prevCompliance: compliance(before, goals, prevGoalDays),
        }
      })
      .sort((a, b) => b.compliance - a.compliance)

    // Meta: la suma de las metas de quienes se están viendo
    const teamGoals = people.reduce((acc, p) => {
      for (const k of GOAL_KEYS) acc[k] += goalsFor(cfg, p.user_id)[k]
      return acc
    }, { calls: 0, effective: 0, quotes: 0, followups: 0, sales: 0 } as Goals)
    const totals = countActivities(current)
    const before = countActivities(previous)

    // Lo cotizado del periodo según cómo terminó: «Por cerrar» es lo que sigue abierto
    const quotedRows = current.filter(r => Number(r.quote_amount) > 0)
    const soldRows = current.filter(r => Number(r.sale_amount) > 0)
    const [{ outcome }, places, newClients, prevNewClients] = await Promise.all([
      quoteOutcomes(ctx, quotedRows, calendar.startOf(from)),
      contactPlaces(ctx, [...new Set(soldRows.map(r => r.contact_id).filter((x): x is string => !!x))]),
      firstSaleCount(ctx, current.filter(r => r.result === 'venta'), calendar.startOf(from)),
      firstSaleCount(ctx, previous.filter(r => r.result === 'venta'), calendar.startOf(prevFrom)),
    ])
    const quotedOutcome = { open: 0, won: 0, lost: 0 }
    for (const r of quotedRows) {
      const o = outcome.get(r.id)
      quotedOutcome[o === 'ganada' ? 'won' : o === 'perdida' ? 'lost' : 'open'] += Number(r.quote_amount)
    }

    // Vendido por zona y por segmento del cliente
    const byZone = new Map<string, number>(), bySegment = new Map<string, number>()
    for (const r of soldRows) {
      const p = r.contact_id ? places.get(r.contact_id) : undefined
      const zone = p?.zone?.trim() || 'Sin zona', segment = p?.segment?.trim() || 'Sin segmento'
      byZone.set(zone, (byZone.get(zone) ?? 0) + Number(r.sale_amount))
      bySegment.set(segment, (bySegment.get(segment) ?? 0) + Number(r.sale_amount))
    }

    // Vendido sumado día por día: este periodo hasta hoy, y el anterior completo
    const soldOn = new Map<string, number>()
    for (const r of rows) {
      const v = Number(r.sale_amount) || 0
      if (v) soldOn.set(dayOf.get(r.id)!, (soldOn.get(dayOf.get(r.id)!) ?? 0) + v)
    }
    const axis: string[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) axis.push(d)
    let acc = 0
    const sold = axis.map(d => d > end ? null : (acc += soldOn.get(d) ?? 0))
    const prevLen = Math.min(axis.length, rangeDays(prevFrom, addDays(from, -1)))
    acc = 0
    const prevSold = Array.from({ length: prevLen }, (_, i) => (acc += soldOn.get(addDays(prevFrom, i)) ?? 0))

    // Contactos registrados (sin notas) por día, semana o mes, según lo largo del periodo
    const bucket = bucketFor(rangeDays(from, end))
    const activity: { start: string; label: string; count: number; current: boolean }[] = []
    const at = new Map<string, number>()
    for (let d = from; d <= end; d = addDays(d, 1)) {
      const b = bucketStart(d, bucket)
      if (!at.has(b)) { at.set(b, activity.length); activity.push({ start: b, label: bucketLabel(b, bucket), count: 0, current: false }) }
    }
    for (const r of current) {
      if (r.kind === 'nota') continue
      const i = at.get(bucketStart(dayOf.get(r.id)!, bucket))
      if (i !== undefined) activity[i].count++
    }
    if (activity.length) activity[activity.length - 1].current = range.partial || end === today

    // El vendedor ve además sus cotizaciones abiertas (enviadas y sin decidir)
    let openQuotes: { count: number; total: number; items: unknown[] } | undefined
    if (!ctx.isAdmin) {
      const { data, error } = await getServerSupabase().from('quotes')
        .select('id, folio, client_name, total, valid_until, sent_at')
        .eq('store_id', ctx.storeId).eq('created_by', ctx.uid).eq('status', 'sent')
        .order('sent_at', { ascending: true }).limit(200)
      if (error) throw error
      const list = data ?? []
      openQuotes = { count: list.length, total: list.reduce((s, q) => s + Number(q.total), 0), items: list.slice(0, 8) }
    }

    return NextResponse.json({
      scope: ctx.isAdmin ? 'store' : 'mine',
      period: f.period, from, to, end, today, prevFrom, prevEnd, partial: range.partial,
      goalDays, fullDays, startedDays,
      // Días naturales del periodo que ya van (los mismos que se toman del anterior)
      elapsedDays: rangeDays(from, end),
      totals, prev: before, quotedOutcome,
      goals: scale(teamGoals, goalDays),
      compliance: compliance(totals, teamGoals, goalDays),
      prevCompliance: compliance(before, teamGoals, prevGoalDays),
      people,
      newClients, prevNewClients,
      series: { axis, sold, prevSold, bucket, activity },
      byZone: rank(byZone), bySegment: rank(bySegment),
      openQuotes,
      options: {
        sellers: ctx.isAdmin ? team.map(m => ({ id: m.user_id, name: m.display_name })).sort((a, b) => a.name.localeCompare(b.name, 'es')) : [],
        ...options,
      },
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/summary', error, 'Error al obtener el reporte')
  }
}
