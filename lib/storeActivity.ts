/**
 * Actividad comercial de la tienda medida en SUS días: el calendario de la
 * tienda (su zona horaria) y la lectura de actividades de un rango, sin las
 * cuentas de prueba cuando se mira a todo el equipo. Inicio, Comercial,
 * Actividad diaria y Acumulado usan esto para que "hoy" y "este mes" sean lo
 * mismo en todas las pantallas. Solo servidor.
 */
import { getServerSupabase, getTestUserIds, type StoreContext } from './supabase-server'
import { fetchPaged } from './paged'
import { addDays, todayISO } from './commercial'
import { zonedDayStart } from './commercialServer'
import { DEFAULT_TZ } from './datetime'

/** Un rango de instantes: desde `from` (incluido) hasta `to` (excluido). */
export type InstantRange = { from: string; to: string }

export type StoreDays = {
  timeZone: string
  /** Hoy en la tienda (AAAA-MM-DD). */
  today: string
  /** Instante en que empieza ese día (AAAA-MM-DD) en la tienda. */
  startOf(isoDate: string): string
  /** De un día a otro, ambos incluidos. */
  days(fromIsoDate: string, toIsoDate: string): InstantRange
  /** Instante en que empieza el mes de hoy (0), el anterior (-1)… */
  monthStart(offset?: number): string
}

export function storeDays(ctx: { store: { timezone?: string | null } }, now = new Date()): StoreDays {
  const timeZone = ctx.store.timezone || DEFAULT_TZ
  const today = todayISO(timeZone, now)
  const startOf = (isoDate: string) => zonedDayStart(isoDate, timeZone).toISOString()
  return {
    timeZone,
    today,
    startOf,
    days: (from, to) => ({ from: startOf(from), to: startOf(addDays(to, 1)) }),
    monthStart: (offset = 0) => {
      const [y, m] = today.split('-').map(Number)
      const first = new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10)
      return startOf(first)
    },
  }
}

/**
 * Actividades de la tienda en un rango (sin `to`, hasta ahora).
 *  · scope 'store': de todo el equipo, sin las cuentas de prueba (no cuentan en los números del equipo).
 *  · scope 'mine': solo las de quien consulta, tal cual.
 * `withValue`: solo las que tienen ese monto (cotizaciones o ventas). `columns` debe incluir user_id.
 */
export async function teamActivities<T>(
  ctx: Pick<StoreContext, 'storeId' | 'uid'>,
  opts: { columns: string; range: { from: string; to?: string }; scope: 'store' | 'mine'; newestFirst?: boolean; withValue?: 'quote_amount' | 'sale_amount' },
): Promise<T[]> {
  const supabase = getServerSupabase()
  const ascending = !opts.newestFirst
  const [rows, tests] = await Promise.all([
    fetchPaged<T & { user_id: string | null }>((from, to) => {
      let q = supabase.from('commercial_activities').select(opts.columns)
        .eq('store_id', ctx.storeId).gte('created_at', opts.range.from)
      if (opts.range.to) q = q.lt('created_at', opts.range.to)
      if (opts.scope === 'mine') q = q.eq('user_id', ctx.uid)
      if (opts.withValue) q = q.not(opts.withValue, 'is', null)
      return q.order('created_at', { ascending }).order('id', { ascending }).range(from, to)
    }, 200000),
    opts.scope === 'store' ? getTestUserIds(ctx.storeId) : Promise.resolve(new Set<string>()),
  ])
  return rows.filter(r => !r.user_id || !tests.has(r.user_id))
}
