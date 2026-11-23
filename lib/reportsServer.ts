/**
 * Datos de Reportes (solo servidor): las actividades del periodo con los
 * filtros de la pantalla (vendedor, zona y segmento) y lo que piden las
 * gráficas. El administrador ve a todo el equipo sin cuentas de prueba; el
 * vendedor, solo lo suyo, aunque cambie la dirección para pedir a otro.
 */
import { getServerSupabase, type StoreContext } from './supabase-server'
import { fetchPaged } from './paged'
import { teamActivities, type InstantRange } from './storeActivity'
import type { ReportFilters } from './reports'

const CHUNK = 150

type Located = { user_id: string | null; contact_id: string | null }

/** Contactos de la tienda en la zona y el segmento elegidos (null si no hay ese filtro). */
async function contactsInPlace(ctx: Pick<StoreContext, 'storeId'>, f: ReportFilters): Promise<Set<string> | null> {
  if (!f.zone && !f.segment) return null
  const supabase = getServerSupabase()
  const rows = await fetchPaged<{ id: string }>((from, to) => {
    let q = supabase.from('contacts').select('id').eq('store_id', ctx.storeId)
    if (f.zone) q = q.eq('zone', f.zone)
    if (f.segment) q = q.eq('segment', f.segment)
    return q.order('id', { ascending: true }).range(from, to)
  }, 200000)
  return new Set(rows.map(r => r.id))
}

/**
 * Actividades de un rango con los filtros aplicados. `columns` debe incluir
 * user_id y contact_id.
 */
export async function reportActivities<T extends Located>(
  ctx: StoreContext, f: ReportFilters,
  opts: { columns: string; range: InstantRange; newestFirst?: boolean; withValue?: 'quote_amount' | 'sale_amount' },
): Promise<T[]> {
  const [rows, place] = await Promise.all([
    teamActivities<T>(ctx, { ...opts, scope: ctx.isAdmin ? 'store' : 'mine' }),
    contactsInPlace(ctx, f),
  ])
  const sellers = ctx.isAdmin && f.sellers.length ? new Set(f.sellers) : null
  return rows.filter(r =>
    (!sellers || (r.user_id !== null && sellers.has(r.user_id)))
    && (!place || (r.contact_id !== null && place.has(r.contact_id))))
}

export type Place = { zone: string | null; segment: string | null }

/** Zona y segmento de unos contactos (los borrados no vienen). */
export async function contactPlaces(ctx: Pick<StoreContext, 'storeId'>, ids: string[]): Promise<Map<string, Place>> {
  const supabase = getServerSupabase()
  const out = new Map<string, Place>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from('contacts').select('id, zone, segment')
      .eq('store_id', ctx.storeId).in('id', ids.slice(i, i + CHUNK))
    if (error) throw error
    for (const c of data ?? []) out.set(c.id, { zone: c.zone, segment: c.segment })
  }
  return out
}

/** Zonas y segmentos de la tienda, para los filtros. */
export async function placeOptions(ctx: Pick<StoreContext, 'storeId'>): Promise<{ zones: string[]; segments: string[] }> {
  const { data, error } = await getServerSupabase().from('app_config').select('type, label')
    .eq('store_id', ctx.storeId).in('type', ['zone', 'segment']).order('label')
  if (error) throw error
  return {
    zones: (data ?? []).filter(c => c.type === 'zone').map(c => c.label as string),
    segments: (data ?? []).filter(c => c.type === 'segment').map(c => c.label as string),
  }
}

/**
 * Cuántos de los clientes con venta en estas actividades compraron por
 * primera vez: no tienen ninguna venta antes de `since` (de nadie del equipo).
 */
export async function firstSaleCount(ctx: Pick<StoreContext, 'storeId'>, sales: { contact_id: string | null }[], since: string): Promise<number> {
  const ids = [...new Set(sales.map(r => r.contact_id).filter((x): x is string => !!x))]
  if (!ids.length) return 0
  const supabase = getServerSupabase()
  const before = new Set<string>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from('commercial_activities').select('contact_id')
      .eq('store_id', ctx.storeId).in('contact_id', ids.slice(i, i + CHUNK)).eq('result', 'venta').lt('created_at', since)
    if (error) throw error
    for (const a of data ?? []) if (a.contact_id) before.add(a.contact_id)
  }
  return ids.filter(id => !before.has(id)).length
}

/** Suma por nombre, de mayor a menor; después de `top`, el resto junto en «Otras». */
export function rank(entries: Iterable<[string, number]>, top = 8): { name: string; value: number }[] {
  const sorted = [...entries].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const head = sorted.slice(0, top).map(([name, value]) => ({ name, value }))
  const rest = sorted.slice(top).reduce((s, [, v]) => s + v, 0)
  return rest > 0 ? [...head, { name: 'Otras', value: rest }] : head
}
