import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS, withOwnerNames } from '@/lib/commercialServer'
import { withContactSearch } from '@/lib/contactSearch'
import { NO_ANSWER_LIMIT, todayISO } from '@/lib/commercial'

const PAGE = 50
const MAX_OFFSET = 100000

/** Cajas de avance de la Cartera (no_contesta = 3 "Sin contacto" seguidos). */
const PORTFOLIO_STAGES = ['nuevo', 'contactado', 'cotizacion', 'cliente', 'no_contesta'] as const
type Stage = typeof PORTFOLIO_STAGES[number]

/**
 * GET /api/data/commercial/portfolio[?stage=&zone=&segment=&owner=&q=&offset=]
 * Cartera: toda la base comercial de la tienda (todo el equipo la ve), de a 50,
 * con lo que toca primero arriba. counts: cuántos hay en cada avance con los
 * mismos filtros (sin el de avance). owner: "me", "none" o el id de alguien.
 * team: el equipo, para filtrar por responsable (solo administradores).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const stage = sp.get('stage') || ''
  if (stage && !(PORTFOLIO_STAGES as readonly string[]).includes(stage)) return jsonError('Avance inválido')
  const zone = sp.get('zone')
  const segment = sp.get('segment')
  if ((zone && zone.length > 60) || (segment && segment.length > 100)) return jsonError('Filtro inválido')
  const owner = sp.get('owner') || ''
  if (owner && owner !== 'me' && owner !== 'none' && !isUUID(owner)) return jsonError('Responsable inválido')
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const offset = Math.max(0, Math.min(Number(sp.get('offset')) || 0, MAX_OFFSET))
  const supabase = getServerSupabase()

  // Filtros comunes (el tipo del constructor de consultas se conserva)
  const filtered = <Q,>(query: Q): Q => {
    let r = query as any
    r = r.eq('store_id', ctx.storeId)
    if (zone) r = r.eq('zone', zone)
    if (segment) r = r.eq('segment', segment)
    if (owner === 'me') r = r.eq('owner_id', ctx.uid)
    else if (owner === 'none') r = r.is('owner_id', null)
    else if (owner) r = r.eq('owner_id', owner)
    return withContactSearch(r, q)
  }
  const byStage = <Q,>(query: Q, s: Stage | ''): Q => {
    const r = query as any
    if (s === 'nuevo') return r.eq('commercial_status', 'nuevo')
    if (s === 'contactado') return r.in('commercial_status', ['contactado', 'interes'])
    if (s === 'cotizacion' || s === 'cliente') return r.eq('commercial_status', s)
    if (s === 'no_contesta') return r.gte('no_answer_streak', NO_ANSWER_LIMIT)
    return r
  }

  try {
    const [members, list, ...counts] = await Promise.all([
      ctx.isAdmin ? getStoreMembers(ctx.storeId).catch(() => []) : Promise.resolve([]),
      byStage(filtered(supabase.from('contacts').select(COMMERCIAL_COLUMNS, { count: 'exact' })), stage as Stage | '')
        .order('next_action_at', { ascending: true, nullsFirst: false })
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1),
      ...PORTFOLIO_STAGES.map(s => byStage(filtered(supabase.from('contacts').select('id', { count: 'exact', head: true })), s)),
    ])
    for (const r of [list, ...counts]) if (r.error) throw r.error

    const rows = (list.data ?? []) as unknown as Record<string, unknown>[]
    return NextResponse.json({
      today: todayISO(ctx.store.timezone || 'America/Mexico_City'),
      contacts: await withOwnerNames(ctx.storeId, rows),
      total: list.count ?? rows.length,
      offset,
      team: members.filter(m => m.status === 'active').map(m => ({ user_id: m.user_id, name: m.display_name, role: m.role })),
      counts: Object.fromEntries(PORTFOLIO_STAGES.map((s, i) => [s, counts[i].count ?? 0])),
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/portfolio', error, 'Error al obtener la cartera')
  }
}
