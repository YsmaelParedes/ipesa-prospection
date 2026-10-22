import { getServerSupabase } from './supabase-server'
import { normalizePhone, phoneVariants } from './phone'

export type TestNumber = { id: string; phone: string; name: string | null }

/** Nombre del contacto para cada número de prueba del agente (si está registrado). */
export async function withContactNames(storeId: string, entries: { id: string; phone: string }[]): Promise<TestNumber[]> {
  const variants = entries.flatMap(e => phoneVariants(e.phone))
  const { data } = variants.length
    ? await getServerSupabase().from('contacts').select('name, phone').eq('store_id', storeId).in('phone', variants)
    : { data: [] }
  const byPhone = new Map((data ?? []).map(c => [normalizePhone(c.phone), c.name as string]))
  return entries.map(e => ({ ...e, name: byPhone.get(e.phone) ?? null }))
}
