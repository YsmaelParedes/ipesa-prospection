import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, getTestUserIds, requireStore } from '@/lib/supabase-server'
import { storeDays, teamActivities } from '@/lib/storeActivity'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { hasSellerGoals, sellerGoalsRequired, storeGoals } from '@/lib/commercialServer'
import {
  EMAIL_RESULT_CHOICES, GOAL_KEYS, RESULT_CHOICES, RESULT_RULES, compliance, countActivities, goalsFor, parseGoals,
  parseGoalsConfig, type ActivityForCount,
} from '@/lib/commercial'

type Row = ActivityForCount & { user_id: string | null; contact_id: string; created_at: string }

const byResult = (rows: Row[]) => [...new Set([...RESULT_CHOICES, ...EMAIL_RESULT_CHOICES])]
  .map(r => ({ result: r, label: RESULT_RULES[r].label, count: rows.filter(x => x.kind !== 'nota' && (x.result === r || (r === 'contactado' && x.result === 'interes'))).length }))
  .filter(x => x.count > 0)

/**
 * GET /api/data/commercial/control — pantalla "Actividad diaria": solo lo de
 * hoy. Cada persona contra su meta del día, lo cotizado y vendido hoy, y el
 * desglose por resultado y por segmento. Semanas y meses están en Acumulado
 * (/summary). Vendedor: solo lo suyo. Las cuentas de prueba no cuentan.
 */
export async function GET() {
  const ctx = await requireStore({ feature: 'salesTeam' })
  if (ctx instanceof Response) return ctx

  const calendar = storeDays(ctx)
  const today = calendar.today
  const range = calendar.days(today, today)

  try {
    const supabase = getServerSupabase()
    const count = (status: string) => supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('store_id', ctx.storeId).eq('commercial_status', status)
    const [rows, members, store, prospects, clients, owned, tests] = await Promise.all([
      // Hoy: todo el equipo sin cuentas de prueba (administrador) o lo propio (vendedor)
      teamActivities<Row>(ctx, {
        columns: 'user_id, contact_id, kind, result, is_followup, quote_amount, sale_amount, created_at',
        range, scope: ctx.isAdmin ? 'store' : 'mine',
      }),
      getStoreMembers(ctx.storeId).catch(() => []),
      supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      count('nuevo'),
      count('cliente'),
      fetchPaged<{ owner_id: string | null }>((from, to) => supabase.from('contacts').select('owner_id')
        .eq('store_id', ctx.storeId).not('owner_id', 'is', null).order('id', { ascending: true }).range(from, to), 200000),
      getTestUserIds(ctx.storeId),
    ])
    if (store.error) throw store.error

    const cfg = storeGoals(ctx, store.data?.commercial_goals)
    const ownedBy = new Map<string, number>()
    for (const o of owned) if (o.owner_id) ownedBy.set(o.owner_id, (ownedBy.get(o.owner_id) ?? 0) + 1)

    // Vendedores: los empleados y quien tenga actividad hoy
    const people = members
      .filter(m => m.status === 'active' && !tests.has(m.user_id) && (ctx.isAdmin || m.user_id === ctx.uid))
      .filter(m => m.role === 'employee' || rows.some(r => r.user_id === m.user_id))
      .map(m => {
        const goals = goalsFor(cfg, m.user_id)
        const day = countActivities(rows.filter(r => r.user_id === m.user_id))
        return {
          user_id: m.user_id, name: m.display_name, role: m.role, goals, custom: !!cfg.byUser[m.user_id],
          owned: ownedBy.get(m.user_id) ?? 0,
          day, dayCompliance: compliance(day, goals),
        }
      })

    // Segmento solo de los contactos con actividad hoy (no hace falta leer toda la base)
    const ids = Array.from(new Set(rows.filter(r => r.kind !== 'nota').map(r => r.contact_id)))
    const segmentOf = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase.from('contacts').select('id, segment')
        .eq('store_id', ctx.storeId).in('id', ids.slice(i, i + 150))
      if (error) throw error
      for (const c of data ?? []) segmentOf.set(c.id, c.segment || 'Sin segmento')
    }
    const bySegment = new Map<string, number>()
    for (const r of rows) {
      if (r.kind === 'nota') continue
      const s = segmentOf.get(r.contact_id) ?? 'Sin segmento'
      bySegment.set(s, (bySegment.get(s) ?? 0) + 1)
    }
    const day = countActivities(rows)

    return NextResponse.json({
      today,
      teamGoals: cfg.team,
      sellerGoals: hasSellerGoals(ctx),
      people,
      totals: { prospects: prospects.count ?? 0, clients: clients.count ?? 0, quoted: day.quoted, sold: day.sold },
      byResult: byResult(rows),
      bySegment: Array.from(bySegment, ([segment, count]) => ({ segment, count })).sort((a, b) => b.count - a.count),
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
