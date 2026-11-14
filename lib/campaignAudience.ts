/**
 * Audiencia de campaña: a qué contactos de la tienda se les puede mandar una
 * plantilla y, si no, por qué. La regla (`audienceBlock`) es la misma que
 * aplica la salida de WhatsApp al enviar, así que lo que la pantalla de
 * Campañas deja elegir es lo que después sale. Solo servidor.
 */
import { getServerSupabase } from './supabase-server'
import { fetchPaged } from './paged'
import { loadReach, noWhatsAppByPhone, noWhatsAppOf, summarizePerson } from './campaignPeople'
import type { PersonState } from './campaignKinds'
import { MARKETING_RETRY_HOURS } from './whatsappSafety'
import { normalizePhone } from './phone'

/** Por qué no se le puede mandar una plantilla a un contacto. */
export type AudienceBlock = 'opt_out' | 'landline' | 'no_whatsapp'
/** Para contactos elegidos a mano: además, los que no tienen un celular válido. */
export type ChosenBlock = AudienceBlock | 'no_phone'

/** La regla única: baja, marcado como fijo o Meta reportó que no tiene WhatsApp (en ese orden). */
export function audienceBlock(p: { optOut: boolean; lineType?: string | null; noWhatsApp: boolean }): AudienceBlock | null {
  if (p.optOut) return 'opt_out'
  if (p.lineType === 'fijo') return 'landline'
  if (p.noWhatsApp) return 'no_whatsapp'
  return null
}

export type AudienceContact = {
  id: string; name: string; phone: string; segment: string | null
  /** Cómo le fue con las campañas ('never' = nunca se le ha mandado una). */
  history: 'never' | PersonState
  block: AudienceBlock | null
  /** Meta pidió esperar MARKETING_RETRY_HOURS h antes de reenviarle marketing (131049); no aplica a plantillas de servicio. */
  hold: boolean
}

type ContactRow = { id: string; name: string; phone: string; segment: string | null; wa_opt_out: boolean; line_type: string | null }

/** Todos los contactos con celular de la tienda, cada uno con su historial y si se le puede mandar. */
export async function loadAudience(storeId: string): Promise<AudienceContact[]> {
  const supabase = getServerSupabase()
  const [contacts, reach, hold] = await Promise.all([
    fetchPaged<ContactRow>((from, to) => supabase.from('contacts').select('id, name, phone, segment, wa_opt_out, line_type')
      .eq('store_id', storeId).not('phone', 'is', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to), 100000),
    loadReach(storeId),
    marketingHoldPhones(storeId),
  ])

  const out: AudienceContact[] = []
  for (const c of contacts) {
    const phone = normalizePhone(c.phone)
    if (phone.length !== 10) continue
    const rows = reach.get(phone) ?? []
    const optOut = !!c.wa_opt_out
    const summary = rows.length ? summarizePerson(rows, optOut) : null
    out.push({
      id: c.id, name: c.name, phone: c.phone, segment: c.segment ?? null,
      history: optOut ? 'opt_out' : summary?.state ?? 'never',
      block: audienceBlock({ optOut, lineType: c.line_type, noWhatsApp: !!noWhatsAppOf(rows) }),
      hold: hold.has(phone),
    })
  }
  return out
}

export type ChosenContact = Omit<AudienceContact, 'history' | 'block'> & { block: ChosenBlock | null }

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

/**
 * Contactos elegidos a mano (desde Contactos) con la misma regla: sin leer el
 * historial de toda la tienda, solo el de sus números.
 */
export async function audienceOf(storeId: string, contactIds: string[]): Promise<ChosenContact[]> {
  const supabase = getServerSupabase()
  const parts = await Promise.all(chunks([...new Set(contactIds)], 150).map(async part => {
    const { data, error } = await supabase.from('contacts').select('id, name, phone, segment, wa_opt_out, line_type')
      .eq('store_id', storeId).in('id', part)
    if (error) throw error
    return (data ?? []) as ContactRow[]
  }))
  const contacts = parts.flat()
  const phoneOf = new Map(contacts.map(c => [c.id, normalizePhone(c.phone ?? '')]))
  const phones = [...phoneOf.values()].filter(p => p.length === 10)
  const [noWhatsApp, hold] = await Promise.all([noWhatsAppByPhone(storeId, phones), marketingHoldPhones(storeId)])
  return contacts.map(c => {
    const phone = phoneOf.get(c.id) ?? ''
    return {
      id: c.id, name: c.name, phone: c.phone, segment: c.segment ?? null,
      block: phone.length !== 10 ? 'no_phone' : audienceBlock({ optOut: !!c.wa_opt_out, lineType: c.line_type, noWhatsApp: noWhatsApp.has(phone) }),
      hold: hold.has(phone),
    }
  })
}

/** Números a los que Meta respondió 131049 en las últimas MARKETING_RETRY_HOURS horas. */
async function marketingHoldPhones(storeId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - MARKETING_RETRY_HOURS * 60 * 60 * 1000).toISOString()
  const rows = await fetchPaged<{ phone: string }>((from, to) =>
    getServerSupabase().from('whatsapp_messages').select('phone')
      .eq('store_id', storeId).eq('direction', 'outbound').eq('error_code', 131049)
      .gte('updated_at', since)
      .order('id', { ascending: true }).range(from, to))
  return new Set(rows.map(r => r.phone))
}
