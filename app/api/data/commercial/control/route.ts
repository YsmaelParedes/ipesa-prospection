import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { hasSalesTeam, salesTeamRequired, zonedDayStart } from '@/lib/commercialServer'
import {
  GOAL_KEYS, RESULT_CHOICES, RESULT_RULES, addDays, compliance, countActivities, goalsFor, parseGoals,
  parseGoalsConfig, todayISO, workDaysUntil, type ActivityForCount,
} from '@/lib/commercial'

type Row = ActivityForCount & { user_id: string | null; contact_id: string; created_at: string }

const byResult = (rows: Row[]) => RESULT_CHOICES
  .map(r => ({ result: r, label: RESULT_RULES[r].label, count: rows.filter(x => x.kind !== 'nota' && (x.result === r || (r === 'contactado' && x.result === 'interes'))).length }))
  .filter(x => x.count > 0)

/**
 * GET /api/data/commercial/control?date=AAAA-MM-DD — pantalla "Equipo":
 * cada persona contra su meta del día y su cumplimiento del mes, totales de
 * la tienda y desglose por resultado y por segmento. Vendedor: solo lo suyo.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const tz = ctx.store.timezone || 'America/Mexico_City'
  const today = todayISO(tz)
  const date = req.nextUrl.searchParams.get('date') || today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date > today) return jsonError('Fecha inválida')

  const monthStart = `${date.slice(0, 7)}-01`
  const range = { from: zonedDayStart(monthStart, tz).toISOString(), to: zonedDayStart(addDays(date, 1), tz).toISOString() }
  const dayFrom = Date.parse(zonedDayStart(date, tz).toISOString())

  try {
    const supabase = getServerSupabase()
    const count = (status: string) => supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('store_id', ctx.storeId).eq('commercial_status', status)
    const [rows, segments, members, store, prospects, clients, owned] = await Promise.all([
      fetchPaged<Row>((from, to) => {
        let q = supabase.from('commercial_activities')
          .select('user_id, contact_id, kind, result, is_followup, quote_amount, sale_amount, created_at')
          .eq('store_id', ctx.storeId).gte('created_at', range.from).lt('created_at', range.to)
        if (!ctx.isAdmin) q = q.eq('user_id', ctx.uid)
        return q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
      }, 200000),
      fetchPaged<{ id: string; segment: string | null }>((from, to) => supabase.from('contacts').select('id, segment')
        .eq('store_id', ctx.storeId).order('id', { ascending: true }).range(from, to), 200000),
      getStoreMembers(ctx.storeId).catch(() => []),
      supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      count('nuevo'),
      count('cliente'),
      fetchPaged<{ owner_id: string | null }>((from, to) => supabase.from('contacts').select('owner_id')
        .eq('store_id', ctx.storeId).not('owner_id', 'is', null).order('id', { ascending: true }).range(from, to), 200000),
    ])
    if (store.error) throw store.error

    const cfg = parseGoalsConfig(store.data?.commercial_goals)
    const workDays = workDaysUntil(date)
    const ownedBy = new Map<string, number>()
    for (const o of owned) if (o.owner_id) ownedBy.set(o.owner_id, (ownedBy.get(o.owner_id) ?? 0) + 1)
    const day = rows.filter(r => Date.parse(r.created_at) >= dayFrom)

    // Vendedores: los empleados y quien tenga actividad este mes
    const people = members
      .filter(m => m.status === 'active' && (ctx.isAdmin || m.user_id === ctx.uid))
      .filter(m => m.role === 'employee' || rows.some(r => r.user_id === m.user_id))
      .map(m => {
        const goals = goalsFor(cfg, m.user_id)
        const dayCounts = countActivities(day.filter(r => r.user_id === m.user_id))
        const monthCounts = countActivities(rows.filter(r => r.user_id === m.user_id))
        return {
          user_id: m.user_id, name: m.display_name, role: m.role, goals, custom: !!cfg.byUser[m.user_id],
          owned: ownedBy.get(m.user_id) ?? 0,
          day: dayCounts, dayCompliance: compliance(dayCounts, goals),
          month: monthCounts, monthCompliance: compliance(monthCounts, goals, workDays),
        }
      })

    const segmentOf = new Map(segments.map(s => [s.id, s.segment || 'Sin segmento']))
    const bySegment = new Map<string, Row[]>()
    for (const r of rows) {
      if (r.kind === 'nota') continue
      const s = segmentOf.get(r.contact_id) ?? 'Sin segmento'
      bySegment.set(s, [...(bySegment.get(s) ?? []), r])
    }
    const month = countActivities(rows)

    return NextResponse.json({
      date, today,
      teamGoals: cfg.team,
      people,
      totals: { prospects: prospects.count ?? 0, clients: clients.count ?? 0, quoted: month.quoted, sold: month.sold },
      dayByResult: byResult(day),
      monthBySegment: Array.from(bySegment, ([segment, list]) => ({ segment, count: list.length }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/control', error, 'Error al obtener el equipo')
  }
}

/**
 * PATCH /api/data/commercial/control { calls, effective, quotes, followups, sales, user_id? }
 * Metas diarias: con user_id, solo las de esa persona; sin él, las de la
 * tienda (las usan quienes no tienen metas propias). { user_id, reset: true }
 * le quita sus metas propias.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const userId = body.user_id ?? null
  if (userId !== null && !isUUID(userId)) return jsonError('Persona inválida')
  const reset = body.reset === true
  if (!reset) {
    for (const k of GOAL_KEYS) {
      const n = Number(body[k])
      if (!Number.isInteger(n) || n < 0 || n > 999) return jsonError('Cada meta debe ser un número entero de 0 a 999')
    }
  }

  const supabase = getServerSupabase()
  const { data: store, error: readError } = await supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle()
  if (readError) return serverError('PATCH /api/data/commercial/control', readError, 'No se pudieron guardar las metas')
  const cfg = parseGoalsConfig(store?.commercial_goals)
  if (userId) {
    if (reset) delete cfg.byUser[userId as string]
    else cfg.byUser[userId as string] = parseGoals(body)
  } else {
    cfg.team = parseGoals(body)
  }
  const { error } = await supabase.from('stores').update({ commercial_goals: { ...cfg.team, byUser: cfg.byUser } }).eq('id', ctx.storeId)
  if (error) return serverError('PATCH /api/data/commercial/control', error, 'No se pudieron guardar las metas')
  return NextResponse.json({ teamGoals: cfg.team, byUser: cfg.byUser })
}
