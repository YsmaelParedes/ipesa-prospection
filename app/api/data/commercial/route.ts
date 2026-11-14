import { withServerTiming } from '@/lib/serverTiming'
import { storeDays } from '@/lib/storeActivity'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { jsonError, serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS, hasReports, hasSalesTeam, storeGoals, withOwnerNames } from '@/lib/commercialServer'
import { withContactSearch } from '@/lib/contactSearch'
import { fetchPaged } from '@/lib/paged'
import { countActivities, goalsFor, type ActivityForCount } from '@/lib/commercial'

const FRESH_PAGE = 30
/** Al refrescar se pide de una vez lo que ya se veía (hasta este tope). */
const MAX_FRESH = 300
const VISIT_PAGE = 30
const MAX_DUE = 500
const FOUND_LIMIT = 50


/**
 * GET /api/data/commercial[?zone=&segment=&q=&offset=&limit=&vlimit=] — la lista de "Hoy":
 *  · due: mis seguimientos con fecha de hoy o vencida (y los sin asignar con fecha)
 *  · fresh: prospectos con teléfono que nadie ha trabajado, de a 30, por zona o búsqueda: primero
 *    los míos (los que di de alta a mano quedan a mi nombre) y luego los sin asignar
 *  · visit: los que no tienen teléfono ("Para visita"), de a 30, igual: míos y sin asignar
 *  · found: con búsqueda, coincidencias en toda la base (de cualquiera y con cualquier fecha)
 *  · counts/goals: lo que llevo hoy contra mi meta
 * Quien registra la primera actividad de un prospecto se queda con él.
 */
async function GETImpl(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const zone = sp.get('zone')
  if (zone !== null && zone.length > 60) return jsonError('Zona inválida')
  const segment = sp.get('segment')
  if (segment !== null && segment.length > 100) return jsonError('Segmento inválido')
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const offset = Math.max(0, Math.min(Number(sp.get('offset')) || 0, 100000))
  // Prospectos nuevos por página; al refrescar, los que ya se veían (sin acentos ni mayúsculas en la búsqueda)
  const freshLimit = Math.max(FRESH_PAGE, Math.min(Number(sp.get('limit')) || FRESH_PAGE, MAX_FRESH))
  const visitLimit = Math.max(VISIT_PAGE, Math.min(Number(sp.get('vlimit')) || VISIT_PAGE, MAX_FRESH))
  const calendar = storeDays(ctx)
  const today = calendar.today
  const todayRange = calendar.days(today, today)
  const supabase = getServerSupabase()

  try {
    let due = supabase.from('contacts').select(COMMERCIAL_COLUMNS, { count: 'exact' }).eq('store_id', ctx.storeId)
      .or(`owner_id.eq.${ctx.uid},owner_id.is.null`)
      .not('next_action_at', 'is', null).lte('next_action_at', today).neq('commercial_status', 'depurar')
    if (zone) due = due.eq('zone', zone)
    if (segment) due = due.eq('segment', segment)
    if (q) due = withContactSearch(due, q)

    // Nuevos y Para visita: primero los míos que nadie ha trabajado (los que di de alta a mano
    // quedan a mi nombre) y luego los sin asignar, que se queda el primero que registra.
    const base = () => {
      let r = supabase.from('contacts').select(COMMERCIAL_COLUMNS, { count: 'exact' }).eq('store_id', ctx.storeId).is('last_activity_at', null)
      if (zone) r = r.eq('zone', zone)
      if (segment) r = r.eq('segment', segment)
      return q ? withContactSearch(r, q) : r
    }
    const freshOf = () => base().is('next_action_at', null).eq('commercial_status', 'nuevo').not('phone', 'is', null)
    const visitOf = () => base().is('phone', null)
    const fresh = freshOf().is('owner_id', null)
    const freshMine = freshOf().eq('owner_id', ctx.uid)
    const visit = visitOf().is('owner_id', null)
    const visitMine = visitOf().eq('owner_id', ctx.uid)

    // Búsqueda en toda la base: también lo que es de otros o toca otro día
    let found = q ? withContactSearch(supabase.from('contacts').select(COMMERCIAL_COLUMNS).eq('store_id', ctx.storeId), q) : null
    if (found && zone) found = found.eq('zone', zone)
    if (found && segment) found = found.eq('segment', segment)

    const [dueRes, freshRes, freshMineRes, visitRes, visitMineRes, activities, store, catalogs, foundRes] = await Promise.all([
      due.order('next_action_at', { ascending: true }).order('id', { ascending: true }).limit(MAX_DUE),
      fresh.order('no_answer_streak', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + freshLimit - 1),
      freshMine.order('created_at', { ascending: false }).order('id', { ascending: true }).limit(freshLimit),
      visit.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(visitLimit),
      visitMine.order('created_at', { ascending: false }).order('id', { ascending: true }).limit(visitLimit),
      supabase.from('commercial_activities').select('kind, result, is_followup, quote_amount, sale_amount')
        .eq('store_id', ctx.storeId).eq('user_id', ctx.uid)
        .gte('created_at', todayRange.from).lt('created_at', todayRange.to),
      supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      supabase.from('app_config').select('type, label').eq('store_id', ctx.storeId).in('type', ['zone', 'segment']).order('label'),
      found ? found.order('name', { ascending: true }).order('id', { ascending: true }).limit(FOUND_LIMIT) : Promise.resolve({ data: null, error: null }),
    ])
    for (const r of [dueRes, freshRes, freshMineRes, visitRes, visitMineRes, activities, store, catalogs, foundRes]) if (r.error) throw r.error
    const foundRows = (foundRes.data ?? []) as unknown as Record<string, unknown>[]

    const dueRows = (dueRes.data ?? []) as unknown as Record<string, unknown>[]
    // Los míos van arriba; la lista se corta en lo que se pidió
    const freshRows = ([...(freshMineRes.data ?? []), ...(freshRes.data ?? [])] as unknown as Record<string, unknown>[]).slice(0, freshLimit)
    const visitRows = ([...(visitMineRes.data ?? []), ...(visitRes.data ?? [])] as unknown as Record<string, unknown>[]).slice(0, visitLimit)

    // Monto de la última cotización de los que están en "Cotización"
    const quoting = [...dueRows, ...foundRows].filter(c => c.commercial_status === 'cotizacion').map(c => c.id as string)
    const quotes = new Map<string, number>()
    if (quoting.length) {
      const data = await fetchPaged<{ contact_id: string; quote_amount: number | string }>((from, to) =>
        supabase.from('commercial_activities').select('contact_id, quote_amount')
          .eq('store_id', ctx.storeId).in('contact_id', quoting).not('quote_amount', 'is', null)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to), 200000)
      for (const a of data) if (!quotes.has(a.contact_id)) quotes.set(a.contact_id, Number(a.quote_amount))
    }

    return NextResponse.json({
      today,
      uid: ctx.uid,
      isAdmin: ctx.isAdmin,
      salesTeam: hasSalesTeam(ctx),
      reports: hasReports(ctx),
      zones: (catalogs.data ?? []).filter(c => c.type === 'zone').map(c => c.label as string),
      segments: (catalogs.data ?? []).filter(c => c.type === 'segment').map(c => c.label as string),
      goals: goalsFor(storeGoals(ctx, store.data?.commercial_goals), ctx.uid),
      counts: countActivities((activities.data ?? []) as ActivityForCount[]),
      due: dueRows.map(c => ({ ...c, quote_amount: quotes.get(c.id as string) ?? null })),
      // La lista llega hasta MAX_DUE; el contador es el total real
      dueTotal: dueRes.count ?? dueRows.length,
      fresh: freshRows,
      freshTotal: (freshMineRes.count ?? 0) + (freshRes.count ?? 0),
      freshMineTotal: freshMineRes.count ?? 0,
      visit: visitRows,
      visitTotal: (visitMineRes.count ?? 0) + (visitRes.count ?? 0),
      visitMineTotal: visitMineRes.count ?? 0,
      found: q ? await withOwnerNames(ctx.storeId, foundRows.map(c => ({ ...c, quote_amount: quotes.get(c.id as string) ?? null }))) : null,
      offset,
    })
  } catch (error) {
    return serverError('GET /api/data/commercial', error, 'Error al obtener tu lista de hoy')
  }
}

export const GET = withServerTiming(GETImpl)

