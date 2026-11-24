import { getServerSupabase, getUserNameMap, type StoreContext } from './supabase-server'
import { PLAN_FEATURE_REQUIRED, planOf } from './stores'
import { parseGoalsConfig, type GoalsConfig } from './commercial'
import { fetchPaged } from './paged'

export const COMMERCIAL_COLUMNS =
  'id, name, phone, email, company, address, postal_code, colonia, zone, segment, acquisition_channel, line_type, owner_id, commercial_status, ' +
  'next_action, next_action_at, last_activity_at, last_result, last_note, no_answer_streak, priority, potential_monthly, origin, created_at'

/** contact_id es null si el contacto se borró; entonces contact_name dice cómo se llamaba. */
export const ACTIVITY_COLUMNS =
  'id, contact_id, contact_name, user_id, kind, result, note, quote_amount, sale_amount, next_action, next_action_at, is_followup, created_at'

/** Nombre para mostrar de una actividad: el del contacto si existe, si no el que tenía al borrarse. */
export function activityClient(
  a: { contact_id: string | null; contact_name?: string | null },
  current: Map<string, string>,
): string {
  if (a.contact_id) return current.get(a.contact_id) ?? 'Contacto'
  return a.contact_name ? `${a.contact_name} (borrado)` : 'Cliente borrado'
}

/** Ids de contacto de una lista de actividades, sin los borrados (null). */
export const liveContactIds = (rows: { contact_id: string | null }[]): string[] =>
  Array.from(new Set(rows.map(r => r.contact_id).filter((id): id is string => !!id)))

/**
 * Los pendientes de hoy de quien consulta: sus seguimientos con fecha de hoy o
 * vencida y los que no tienen responsable. La usan la lista de Hoy y su número
 * en el menú, para que siempre cuenten lo mismo.
 */
export function dueToday(ctx: StoreContext, today: string, columns: string, head = false) {
  return getServerSupabase().from('contacts').select(columns, { count: 'exact', head }).eq('store_id', ctx.storeId)
    .or(`owner_id.eq.${ctx.uid},owner_id.is.null`)
    .not('next_action_at', 'is', null).lte('next_action_at', today).neq('commercial_status', 'depurar')
}

/** Reparto, metas y control diario: Cubeta e Interno (Litro trabaja solo). */
export const hasSalesTeam = (ctx: StoreContext) => planOf(ctx.plan).salesTeam
/** Reportes (con su Excel): Cubeta e Interno. */
export const hasReports = (ctx: StoreContext) => planOf(ctx.plan).reports
/** Metas propias por vendedor: Cubeta e Interno. */
export const hasSellerGoals = (ctx: StoreContext) => planOf(ctx.plan).sellerGoals

/**
 * Las metas que aplican hoy en la tienda. Sin metas por vendedor en su plan,
 * todos usan la de la tienda; las propias se conservan guardadas por si
 * vuelve a Cubeta.
 */
export function storeGoals(ctx: StoreContext, raw: unknown): GoalsConfig {
  const cfg = parseGoalsConfig(raw)
  return hasSellerGoals(ctx) ? cfg : { ...cfg, byUser: {} }
}

/** Para una comprobación que depende de la petición (las rutas enteras usan requireStore({ feature })). */
export function sellerGoalsRequired(): Response {
  return Response.json({ error: PLAN_FEATURE_REQUIRED.sellerGoals, code: 'PLAN_FEATURE' }, { status: 403 })
}

/**
 * Contacto de la tienda para el sistema comercial. Todo el equipo ve toda la
 * base: quien registra una actividad se queda con el contacto. Devuelve el contacto o null.
 */
export async function getVisibleContact(ctx: StoreContext, contactId: string) {
  const { data } = await getServerSupabase().from('contacts').select('id, owner_id')
    .eq('id', contactId).eq('store_id', ctx.storeId).maybeSingle()
  return (data ?? null) as { id: string; owner_id: string | null } | null
}

/** Inicio de un día (AAAA-MM-DD) en la zona horaria de la tienda, como instante UTC. */
export function zonedDayStart(isoDate: string, timeZone: string): Date {
  const noonUtc = new Date(`${isoDate}T12:00:00Z`)
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(noonUtc).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(offset)
  const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - minutes * 60_000)
}

/** Agrega el nombre del responsable (para "De Ana" en las listas). */
export async function withOwnerNames<T extends Record<string, unknown>>(storeId: string, rows: T[]): Promise<(T & { owner_name: string | null })[]> {
  const names = rows.some(r => r.owner_id) ? await getUserNameMap(storeId).catch(() => new Map<string, string>()) : new Map<string, string>()
  return rows.map(r => ({ ...r, owner_name: r.owner_id ? (names.get(r.owner_id as string) ?? 'Usuario') : null }))
}

export type QuoteOutcome = 'abierta' | 'ganada' | 'perdida'
type QuotedRow = { id: string; contact_id: string | null; created_at: string }
type OutcomeContact = { id: string; name: string; company: string | null; commercial_status: string }
const LOST_STATUSES = new Set(['no_interesado', 'depurar'])

/**
 * Cómo terminó cada cotización registrada (Reportes › Desempeño: tarjeta y detalle).
 * «Ganada» si después hubo una venta a ese cliente, «perdida» si el cliente
 * quedó como no interesado o por depurar, y si no, «abierta». `since`: inicio
 * del periodo (una venta anterior no la gana). Devuelve también los contactos
 * que siguen existiendo, para no volver a pedirlos.
 */
export async function quoteOutcomes(ctx: StoreContext, rows: QuotedRow[], since: string) {
  const supabase = getServerSupabase()
  const ids = liveContactIds(rows)
  const contacts = new Map<string, OutcomeContact>()
  const lastSale = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200)
    const [found, sales] = await Promise.all([
      fetchPaged<OutcomeContact>((f, t) => supabase.from('contacts').select('id, name, company, commercial_status')
        .eq('store_id', ctx.storeId).in('id', part).order('id', { ascending: true }).range(f, t), 5000),
      fetchPaged<{ contact_id: string; created_at: string }>((f, t) => supabase.from('commercial_activities')
        .select('contact_id, created_at').eq('store_id', ctx.storeId).in('contact_id', part)
        .not('sale_amount', 'is', null).gte('created_at', since)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(f, t), 200000),
    ])
    for (const c of found) contacts.set(c.id, c)
    for (const s of sales) if (!lastSale.has(s.contact_id)) lastSale.set(s.contact_id, s.created_at)
  }
  const outcome = new Map<string, QuoteOutcome>()
  for (const r of rows) {
    const sale = r.contact_id ? lastSale.get(r.contact_id) : undefined
    const c = r.contact_id ? contacts.get(r.contact_id) : undefined
    outcome.set(r.id, sale && sale >= r.created_at ? 'ganada' : c && LOST_STATUSES.has(c.commercial_status) ? 'perdida' : 'abierta')
  }
  return { outcome, contacts }
}
