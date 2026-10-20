import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { hasSalesTeam, salesTeamRequired, zonedDayStart } from '@/lib/commercialServer'
import {
  GOAL_KEYS, RESULTS, RESULT_RULES, addDays, countActivities, parseGoals, todayISO, type ActivityForCount,
} from '@/lib/commercial'

type Row = ActivityForCount & { user_id: string | null; contact_id: string; created_at: string }

/**
 * GET /api/data/commercial/control?date=AAAA-MM-DD[&user=uuid]
 * Control diario contra la meta (por persona) y resumen del mes: montos,
 * resultados y segmentos. Vendedor: solo lo suyo. Dueño/administrador: el
 * equipo, o una persona con ?user=.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const tz = ctx.store.timezone || 'America/Mexico_City'
  const date = req.nextUrl.searchParams.get('date') || todayISO(tz)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return jsonError('Fecha inválida')
  const userParam = req.nextUrl.searchParams.get('user')
  if (userParam && !isUUID(userParam)) return jsonError('Persona inválida')
  const only = ctx.isAdmin ? userParam : ctx.uid

  const monthStart = `${date.slice(0, 7)}-01`
  const nextMonth = addDays(monthStart, 32).slice(0, 7) + '-01'
  const range = { from: zonedDayStart(monthStart, tz).toISOString(), to: zonedDayStart(nextMonth, tz).toISOString() }
  const day = { from: zonedDayStart(date, tz).toISOString(), to: zonedDayStart(addDays(date, 1), tz).toISOString() }

  try {
    const supabase = getServerSupabase()
    const [rows, segments, members, store] = await Promise.all([
      fetchPaged<Row>((from, to) => {
        let q = supabase.from('commercial_activities')
          .select('user_id, contact_id, kind, result, is_followup, quote_amount, sale_amount, created_at')
          .eq('store_id', ctx.storeId).gte('created_at', range.from).lt('created_at', range.to)
        if (only) q = q.eq('user_id', only)
        return q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
      }, 200000),
      fetchPaged<{ id: string; segment: string | null }>((from, to) => supabase.from('contacts').select('id, segment')
        .eq('store_id', ctx.storeId).order('id', { ascending: true }).range(from, to), 200000),
      getStoreMembers(ctx.storeId).catch(() => []),
      supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
    ])
    if (store.error) throw store.error

    const dayFrom = Date.parse(day.from), dayTo = Date.parse(day.to)
    const today = rows.filter(r => { const t = Date.parse(r.created_at); return t >= dayFrom && t < dayTo })
    const people = members
      .filter(m => m.status === 'active' && (!only || m.user_id === only))
      .map(m => ({ user_id: m.user_id, name: m.display_name, role: m.role, counts: countActivities(today.filter(r => r.user_id === m.user_id)) }))

    const segmentOf = new Map(segments.map(s => [s.id, s.segment || 'Sin segmento']))
    const bySegment = new Map<string, Row[]>()
    for (const r of rows) {
      const s = segmentOf.get(r.contact_id) ?? 'Sin segmento'
      bySegment.set(s, [...(bySegment.get(s) ?? []), r])
    }

    return NextResponse.json({
      date,
      goals: parseGoals(store.data?.commercial_goals),
      people,
      day: countActivities(today),
      month: {
        from: monthStart,
        counts: countActivities(rows),
        byResult: RESULTS.map(r => ({ result: r, label: RESULT_RULES[r].label, count: rows.filter(x => x.kind !== 'nota' && x.result === r).length }))
          .filter(x => x.count > 0),
        bySegment: Array.from(bySegment, ([segment, list]) => ({ segment, ...countActivities(list) }))
          .sort((a, b) => b.calls + b.effective - (a.calls + a.effective)),
      },
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/control', error, 'Error al obtener el control diario')
  }
}

// PATCH /api/data/commercial/control { calls, effective, quotes, followups, sales } — metas diarias por persona
export async function PATCH(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  for (const k of GOAL_KEYS) {
    const n = Number(body[k])
    if (!Number.isInteger(n) || n < 0 || n > 999) return jsonError('Cada meta debe ser un número entero de 0 a 999')
  }
  const goals = parseGoals(body)
  const { error } = await getServerSupabase().from('stores').update({ commercial_goals: goals }).eq('id', ctx.storeId)
  if (error) return serverError('PATCH /api/data/commercial/control', error, 'No se pudieron guardar las metas')
  return NextResponse.json({ goals })
}
