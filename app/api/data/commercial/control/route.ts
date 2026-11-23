import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, getTestUserIds, requireStore } from '@/lib/supabase-server'
import { storeDays } from '@/lib/storeActivity'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { hasSellerGoals, sellerGoalsRequired, storeGoals } from '@/lib/commercialServer'
import { placeOptions, reportActivities } from '@/lib/reportsServer'
import { parseFilters } from '@/lib/reports'
import {
  EMAIL_RESULT_CHOICES, GOAL_KEYS, RESULT_CHOICES, RESULT_RULES, compliance, countActivities, goalsFor, parseGoals,
  parseGoalsConfig, type ActivityForCount, type Goals,
} from '@/lib/commercial'

type Row = ActivityForCount & { user_id: string | null; contact_id: string | null; created_at: string }

const byResult = (rows: Row[]) => [...new Set([...RESULT_CHOICES, ...EMAIL_RESULT_CHOICES])]
  .map(r => ({ result: r, label: RESULT_RULES[r].label, count: rows.filter(x => x.kind !== 'nota' && (x.result === r || (r === 'contactado' && x.result === 'interes'))).length }))
  .filter(x => x.count > 0)

/**
 * GET /api/data/commercial/control?sellers=&zone=&segment= — Reportes › Equipo
 * hoy (administradores): solo lo de hoy. Cada vendedor contra su meta del día,
 * el equipo completo contra la suma de las metas, lo cotizado y vendido hoy y
 * cómo les fue. Los periodos están en Desempeño (/summary). Las cuentas de
 * prueba no cuentan.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ admin: true, feature: 'salesTeam' })
  if (ctx instanceof Response) return ctx

  const f = parseFilters(req.nextUrl.searchParams)
  const calendar = storeDays(ctx)
  const today = calendar.today

  try {
    const [rows, members, store, tests, options] = await Promise.all([
      reportActivities<Row>(ctx, f, {
        columns: 'user_id, contact_id, kind, result, is_followup, quote_amount, sale_amount, created_at',
        range: calendar.days(today, today),
      }),
      getStoreMembers(ctx.storeId).catch(() => []),
      getServerSupabase().from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      getTestUserIds(ctx.storeId),
      placeOptions(ctx),
    ])
    if (store.error) throw store.error

    const cfg = storeGoals(ctx, store.data?.commercial_goals)
    const chosen = f.sellers.length ? new Set(f.sellers) : null
    const team = members.filter(m => m.status === 'active' && !tests.has(m.user_id))
    // Vendedores: los empleados y quien tenga actividad hoy (o los elegidos)
    const people = team
      .filter(m => chosen ? chosen.has(m.user_id) : m.role === 'employee' || rows.some(r => r.user_id === m.user_id))
      .map(m => {
        const goals = goalsFor(cfg, m.user_id)
        const day = countActivities(rows.filter(r => r.user_id === m.user_id))
        return { user_id: m.user_id, name: m.display_name, role: m.role, goals, custom: !!cfg.byUser[m.user_id], day, dayCompliance: compliance(day, goals) }
      })
      .sort((a, b) => b.dayCompliance - a.dayCompliance)

    const teamGoals = people.reduce((acc, p) => {
      for (const k of GOAL_KEYS) acc[k] += p.goals[k]
      return acc
    }, { calls: 0, effective: 0, quotes: 0, followups: 0, sales: 0 } as Goals)
    const day = countActivities(rows)

    return NextResponse.json({
      today,
      // Metas de la tienda (las usan quienes no tienen metas propias)
      teamGoals: cfg.team,
      sellerGoals: hasSellerGoals(ctx),
      people,
      team: { day, goals: teamGoals, compliance: compliance(day, teamGoals) },
      byResult: byResult(rows),
      options: {
        sellers: team.map(m => ({ id: m.user_id, name: m.display_name })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
        ...options,
      },
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/control', error, 'Error al obtener la actividad del día')
  }
}

/**
 * PATCH /api/data/commercial/control { calls, effective, quotes, followups, sales, user_id? }
 * Metas diarias: con user_id, solo las de esa persona; sin él, las de la
 * tienda (las usan quienes no tienen metas propias). { user_id, reset: true }
 * le quita sus metas propias.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true, feature: 'salesTeam' })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const userId = body.user_id ?? null
  if (userId !== null && !isUUID(userId)) return jsonError('Persona inválida')
  if (userId !== null && !hasSellerGoals(ctx)) return sellerGoalsRequired()
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
  // Se lee completo: las metas propias guardadas se conservan aunque el plan no las use
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
