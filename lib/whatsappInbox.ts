import { getServerSupabase } from './supabase-server'
import { normalizePhone } from './phone'

export type ContactSummary = {
  id: string
  name: string
  phone: string
  email: string | null
  company: string | null
  segment: string | null
  acquisition_channel: string | null
  wa_opt_out: boolean
}

const CONTACT_FIELDS = 'id, name, phone, email, company, segment, acquisition_channel, wa_opt_out'

/**
 * Busca los contactos de un conjunto de números (por id ya vinculado o por
 * teléfono, incluyendo formatos heredados 52…/521…) y los indexa por
 * teléfono normalizado de 10 dígitos.
 */
export async function contactsForPhones(storeId: string, phones: string[], contactIds: string[] = []): Promise<Map<string, ContactSummary>> {
  const supabase = getServerSupabase()
  const variants = [...new Set(phones)].flatMap(p => [p, `52${p}`, `521${p}`])
  const ids = [...new Set(contactIds)]
  // Lotes chicos para no rebasar el largo máximo de URL de PostgREST
  const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

  const results = await Promise.all([
    ...chunks(ids, 150).map(part => supabase.from('contacts').select(CONTACT_FIELDS).eq('store_id', storeId).in('id', part)),
    ...chunks(variants, 300).map(part => supabase.from('contacts').select(CONTACT_FIELDS).eq('store_id', storeId).in('phone', part)),
  ])
  const map = new Map<string, ContactSummary>()
  for (const { data } of results) {
    for (const c of (data ?? []) as ContactSummary[]) {
      const key = normalizePhone(c.phone)
      if (!map.has(key)) map.set(key, c)
    }
  }
  return map
}

export async function contactForPhone(storeId: string, phone: string, contactId?: string | null): Promise<ContactSummary | null> {
  const map = await contactsForPhones(storeId, [phone], contactId ? [contactId] : [])
  return map.get(phone) ?? (contactId ? [...map.values()].find(c => c.id === contactId) ?? null : null)
}
