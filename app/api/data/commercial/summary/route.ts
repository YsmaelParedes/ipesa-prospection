import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, getTestUserIds, requireStore } from '@/lib/supabase-server'
import { storeDays, teamActivities } from '@/lib/storeActivity'
import { jsonError, serverError } from '@/lib/validation'
import { storeGoals } from '@/lib/commercialServer'
import {
  GOAL_KEYS, addDays, compliance, countActivities, goalsFor, periodRange,
  workDaysBetween, type ActivityForCount, type Goals, type Period,
} from '@/lib/commercial'

type Row = ActivityForCount & { user_id: string | null; created_at: string }

const MAX_OFFSET = 400

/** Meta del periodo: la meta diaria por los días hábiles transcurridos. */
const scale = (goals: Goals, days: number): Goals =>
  Object.fromEntries(GOAL_KEYS.map(k => [k, goals[k] * days])) as Goals

/**
 * GET /api/data/commercial/summary?period=day|week|month&offset=0 — pestaña
 * "Acumulado" (solo administradores): totales del periodo, los mismos días del
 * periodo anterior para comparar, avance contra la meta y el desglose por
 * vendedor.
 *
 * Un periodo en curso se compara contra los mismos días del anterior (no
 * contra el periodo completo), si no siempre se vería a la baja.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ admin: true, feature: 'reports' })
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const period = (sp.get('period') || 'week') as Period
  if (period !== 'day' && period !== 'week' && period !== 'month') return jsonError('Periodo inválido')
  const offset = Number(sp.get('offset') ?? 0)
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) return jsonError('Periodo fuera de rango')

  const calendar = storeDays(ctx)
  const today = calendar.today
  const { from, to } = periodRange(period, today, offset)
  // Un periodo en curso llega hasta hoy; uno pasado, hasta su último día
  const end = to > today ? today : to
  const days = workDaysBetween(from, end)
  const fullDays = workDaysBetween(from, to)
  // Un día se mide contra la meta diaria (aunque sea domingo). Un mes que empieza
  // en domingo aún no tiene días hábiles: se mide contra el periodo completo
  const goalDays = period === 'day' ? 1 : days || fullDays

  const prev = periodRange(period, from, 1)
  // Los mismos días naturales del periodo anterior, para que la comparación sea justa
  const elapsed = Math.round((Date.parse(end) - Date.parse(from)) / 86_400_000)
  const sameDay = addDays(prev.from, elapsed)
  // Un mes anterior más corto (febrero) no puede pasarse de su último día
  const prevEnd = sameDay > prev.to ? prev.to : sameDay
  const prevGoalDays = period === 'day' ? 1 : workDaysBetween(prev.from, prevEnd) || workDaysBetween(prev.from, prev.to)

  try {
    const supabase = getServerSupabase()
    const [rows, members, store, tests] = await Promise.all([
      // Del periodo anterior a hoy, de todo el equipo sin cuentas de prueba
      teamActivities<Row>(ctx, {
        columns: 'user_id, kind, result, is_followup, quote_amount, sale_amount, created_at',
        range: calendar.days(prev.from, end), scope: 'store',
      }),
      getStoreMembers(ctx.storeId).catch(() => []),
      supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      getTestUserIds(ctx.storeId),
    ])
    if (store.error) throw store.error
    const startsAt = Date.parse(calendar.startOf(from))
    const prevEndsAt = Date.parse(calendar.startOf(addDays(prevEnd, 1)))
    const current = rows.filter(r => Date.parse(r.created_at) >= startsAt)
    const previous = rows.filter(r => Date.parse(r.created_at) < prevEndsAt)

    const cfg = storeGoals(ctx, store.data?.commercial_goals)
    const people = members
      .filter(m => m.status === 'active' && !tests.has(m.user_id))
      .filter(m => m.role === 'employee' || current.some(r => r.user_id === m.user_id))
      .map(m => {
        const goals = goalsFor(cfg, m.user_id)
        const counts = countActivities(current.filter(r => r.user_id === m.user_id))
        const before = countActivities(previous.filter(r => r.user_id === m.user_id))
        return {
          user_id: m.user_id, name: m.display_name, custom: !!cfg.byUser[m.user_id],
          counts, prev: before, goals: scale(goals, goalDays), compliance: compliance(counts, goals, goalDays),
        }
      })
      .sort((a, b) => b.compliance - a.compliance)

    // Meta de la tienda: la suma de las metas de quienes venden
    const teamGoals = people.reduce((acc, p) => {
      for (const k of GOAL_KEYS) acc[k] += goalsFor(cfg, p.user_id)[k]
      return acc
    }, { calls: 0, effective: 0, quotes: 0, followups: 0, sales: 0 } as Goals)
    const totals = countActivities(current)
    const before = countActivities(previous)

    return NextResponse.json({
      period, offset, from, to, end, today,
      // goalDays: días hábiles ya transcurridos (o los del periodo completo si aún no hay ninguno)
      goalDays, fullDays, startedDays: days,
      elapsedDays: elapsed + 1,
      partial: end < to,
      prevFrom: prev.from, prevEnd,
      totals, prev: before,
      goals: scale(teamGoals, goalDays),
      compliance: compliance(totals, teamGoals, goalDays),
      prevCompliance: compliance(before, teamGoals, prevGoalDays),
      people,
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/summary', error, 'Error al obtener el acumulado')
  }
}
