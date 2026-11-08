import { getServerSupabase, getUserNameMap, type StoreContext } from './supabase-server'
import { planOf } from './stores'
import { parseGoalsConfig, type GoalsConfig } from './commercial'

export const COMMERCIAL_COLUMNS =
  'id, name, phone, email, company, address, postal_code, colonia, zone, segment, acquisition_channel, line_type, owner_id, commercial_status, ' +
  'next_action, next_action_at, last_activity_at, last_result, last_note, no_answer_streak, priority, potential_monthly, origin, created_at'

export const ACTIVITY_COLUMNS =
  'id, contact_id, user_id, kind, result, note, quote_amount, sale_amount, next_action, next_action_at, is_followup, created_at'

/** Reparto, metas y control diario: Galón, Cubeta e Interno (Litro solo tiene la cola). */
export const hasSalesTeam = (ctx: StoreContext) => planOf(ctx.plan).salesTeam
/** Acumulado y reportes en Excel: Cubeta e Interno. */
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

export function salesTeamRequired(): Response {
  return Response.json(
    { error: 'Oportunidades, Actividad diaria y las metas del equipo vienen en los planes Galón y Cubeta.', code: 'PLAN_FEATURE' },
    { status: 403 },
  )
}

export function sellerGoalsRequired(): Response {
  return Response.json({ error: 'Las metas propias para cada vendedor vienen en el plan Cubeta.', code: 'PLAN_FEATURE' }, { status: 403 })
}

export function reportsRequired(): Response {
  return Response.json({ error: 'Acumulado y los reportes en Excel vienen en el plan Cubeta.', code: 'PLAN_FEATURE' }, { status: 403 })
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
