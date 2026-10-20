import { getServerSupabase, type StoreContext } from './supabase-server'

/**
 * Leads quedó como archivo (lo reemplazó el sistema comercial): solo se usa
 * para validar los recordatorios viejos ligados a un lead. Solo leads de la
 * tienda activa. Dueño/admin: todos. Vendedor: los suyos y los heredados sin
 * dueño (user_id NULL). Devuelve el lead (id, user_id, name) o null.
 */
export async function getAccessibleLead(ctx: StoreContext, leadId: string) {
  const { data } = await getServerSupabase().from('leads').select('id, user_id, name')
    .eq('id', leadId).eq('store_id', ctx.storeId).maybeSingle()
  if (!data) return null
  if (!ctx.isAdmin && data.user_id && data.user_id !== ctx.uid) return null
  return data
}
