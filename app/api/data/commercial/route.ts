import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { jsonError, serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS, hasSalesTeam, zonedDayStart } from '@/lib/commercialServer'
import { withContactSearch } from '@/lib/contactSearch'
import { addDays, countActivities, goalsFor, parseGoalsConfig, todayISO, type ActivityForCount } from '@/lib/commercial'

const FRESH_PAGE = 30
/** Al refrescar se pide de una vez lo que ya se veía (hasta este tope). */
const MAX_FRESH = 300
const VISIT_PAGE = 20
const MAX_DUE = 500


/**
 * GET /api/data/commercial[?zone=&q=&offset=&limit=] — la lista de "Hoy":
 *  · due: mis seguimientos con fecha de hoy o vencida (y los sin asignar con fecha)
 *  · fresh: prospectos con teléfono que nadie ha trabajado (sin asignar), de a 30, por zona o búsqueda
 *  · visit: los que no tienen teléfono ("Para visita"), primeros 20 y el total
 *  · counts/goals: lo que llevo hoy contra mi meta
 * Quien registra la primera actividad de un prospecto se queda con él.
 */
async function GETImpl(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const zone = sp.get('zone')
  if (zone !== null && zone.length > 60) return jsonError('Zona inválida')
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const offset = Math.max(0, Math.min(Number(sp.get('offset')) || 0, 100000))
  // Prospectos nuevos por página; al refrescar, los que ya se veían (sin acentos ni mayúsculas en la búsqueda)
  const freshLimit = Math.max(FRESH_PAGE, Math.min(Number(sp.get('limit')) || FRESH_PAGE, MAX_FRESH))
  const tz = ctx.store.timezone || 'America/Mexico_City'
  const today = todayISO(tz)
  const supabase = getServerSupabase()

  try {
    let due = supabase.from('contacts').select(COMMERCIAL_COLUMNS).eq('store_id', ctx.storeId)
      .or(`owner_id.eq.${ctx.uid},owner_id.is.null`)
      .not('next_action_at', 'is', null).lte('next_action_at', today).neq('commercial_status', 'depurar')
    if (zone) due = due.eq('zone', zone)
    if (q) due = withContactSearch(due, q)

    let fresh = supabase.from('contacts').select(COMMERCIAL_COLUMNS, { count: 'exact' }).eq('store_id', ctx.storeId)
      .is('owner_id', null).is('last_activity_at', null).is('next_action_at', null).eq('commercial_status', 'nuevo')
      .not('phone', 'is', null)
    if (zone) fresh = fresh.eq('zone', zone)
    if (q) fresh = withContactSearch(fresh, q)

    let visit = supabase.from('contacts').select(COMMERCIAL_COLUMNS, { count: 'exact' }).eq('store_id', ctx.storeId)
      .is('owner_id', null).is('last_activity_at', null).is('phone', null)
    if (zone) visit = visit.eq('zone', zone)
    if (q) visit = withContactSearch(visit, q)

    const [dueRes, freshRes, visitRes, activities, store, zones] = await Promise.all([
      due.order('next_action_at', { ascending: true }).order('id', { ascending: true }).limit(MAX_DUE),
      fresh.order('no_answer_streak', { ascending: true }).order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + freshLimit - 1),
      visit.order('created_at', { ascending: true }).order('id', { ascending: true }).limit(VISIT_PAGE),
      supabase.from('commercial_activities').select('kind, result, is_followup, quote_amount, sale_amount')
        .eq('store_id', ctx.storeId).eq('user_id', ctx.uid)
        .gte('created_at', zonedDayStart(today, tz).toISOString()).lt('created_at', zonedDayStart(addDays(today, 1), tz).toISOString()),
      supabase.from('stores').select('commercial_goals').eq('id', ctx.storeId).maybeSingle(),
      supabase.from('app_config').select('label').eq('store_id', ctx.storeId).eq('type', 'zone').order('label'),
    ])
    for (const r of [dueRes, freshRes, visitRes, activities, store, zones]) if (r.error) throw r.error

    const dueRows = (dueRes.data ?? []) as unknown as Record<string, unknown>[]
    const freshRows = (freshRes.data ?? []) as unknown as Record<string, unknown>[]

    // Monto de la última cotización de los que están en "Cotización"
    const quoting = dueRows.filter(c => c.commercial_status === 'cotizacion').map(c => c.id as string)
    const quotes = new Map<string, number>()
    if (quoting.length) {
      const { data } = await supabase.from('commercial_activities').select('contact_id, quote_amount')
        .eq('store_id', ctx.storeId).in('contact_id', quoting).not('quote_amount', 'is', null)
        .order('created_at', { ascending: false })
      for (const a of data ?? []) if (!quotes.has(a.contact_id)) quotes.set(a.contact_id, Number(a.quote_amount))
    }

    return NextResponse.json({
      today,
      uid: ctx.uid,
      isAdmin: ctx.isAdmin,
      salesTeam: hasSalesTeam(ctx),
      zones: (zones.data ?? []).map(z => z.label as string),
      goals: goalsFor(parseGoalsConfig(store.data?.commercial_goals), ctx.uid),
      counts: countActivities((activities.data ?? []) as ActivityForCount[]),
      due: dueRows.map(c => ({ ...c, quote_amount: quotes.get(c.id as string) ?? null })),
      fresh: freshRows,
      freshTotal: freshRes.count ?? freshRows.length,
      visit: visitRes.data ?? [],
      visitTotal: visitRes.count ?? 0,
      offset,
    })
  } catch (error) {
    return serverError('GET /api/data/commercial', error, 'Error al obtener tu lista de hoy')
  }
}

export const GET = withServerTiming(GETImpl)
