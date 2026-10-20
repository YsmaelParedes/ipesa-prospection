import { getServerSupabase, type StoreContext } from './supabase-server'
import { planOf } from './stores'

export const COMMERCIAL_COLUMNS =
  'id, name, phone, email, company, address, postal_code, colonia, segment, acquisition_channel, owner_id, commercial_status, ' +
  'next_action, next_action_at, last_activity_at, last_result, last_note, no_answer_streak, created_at'

export const ACTIVITY_COLUMNS =
  'id, contact_id, user_id, kind, result, note, quote_amount, sale_amount, next_action, next_action_at, is_followup, created_at'

/** Reparto, metas y control diario: Galón, Cubeta e Interno (Litro solo tiene la cola). */
export const hasSalesTeam = (ctx: StoreContext) => planOf(ctx.plan).salesTeam

export function salesTeamRequired(): Response {
  return Response.json(
    { error: 'El reparto de contactos, las metas y el control diario vienen en los planes Galón y Cubeta.', code: 'PLAN_FEATURE' },
    { status: 403 },
  )
}

/**
 * ¿Puede ver este contacto en el sistema comercial? Dueño/administrador: todos
 * los de la tienda. Vendedor: solo los suyos. Devuelve el contacto o null.
 */
export async function getVisibleContact(ctx: StoreContext, contactId: string) {
  const { data } = await getServerSupabase().from('contacts').select('id, owner_id')
    .eq('id', contactId).eq('store_id', ctx.storeId).maybeSingle()
  if (!data) return null
  if (!ctx.isAdmin && data.owner_id !== ctx.uid) return null
  return data as { id: string; owner_id: string | null }
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
