import { getServerSupabase } from './supabase-server'

/** "  Veracruz  Puerto " → "veracruz puerto" (sin acentos, mayúsculas ni espacios de más). */
export const zoneKey = (label: string) =>
  label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * La zona de un contacto tal como debe guardarse. Si ya existe en las zonas de
 * la tienda (aunque cambien mayúsculas o acentos) se usa esa; si es nueva
 * (alguien eligió «Otra…» y la escribió), se agrega a las zonas de la tienda
 * para que aparezca en la lista, los filtros y los reportes.
 */
export async function ensureZone(storeId: string, raw: string): Promise<string> {
  const label = raw.replace(/\s+/g, ' ').trim()
  if (!label) return label
  const supabase = getServerSupabase()
  const { data, error } = await supabase.from('app_config').select('label').eq('store_id', storeId).eq('type', 'zone')
  if (error) throw error
  const key = zoneKey(label)
  const found = (data ?? []).find(z => zoneKey(z.label) === key)
  if (found) return found.label
  const { error: insertError } = await supabase.from('app_config').insert([{ store_id: storeId, type: 'zone', label }])
  // Si otra persona la agregó al mismo tiempo, igual queda una sola
  if (insertError && insertError.code !== '23505') throw insertError
  return label
}
