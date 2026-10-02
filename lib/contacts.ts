import { getServerSupabase } from './supabase-server'
import { parseFields, type ParseResult, type Schema } from './validation'
import { normalizePhone } from './phone'

/** Columnas que se devuelven al cliente (sin columnas heredadas sin uso). */
export const CONTACT_COLUMNS = 'id, name, phone, email, company, address, postal_code, segment, acquisition_channel, wa_opt_out, created_at, updated_at'

/** Columnas editables de `contacts` (lista blanca + validación). */
export const CONTACT_SCHEMA: Schema = {
  name:                { type: 'text', max: 200, required: true, label: 'Nombre' },
  phone:               { type: 'text', max: 30,  required: true, label: 'Teléfono' },
  email:               { type: 'text', max: 254, label: 'Correo', pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  company:             { type: 'text', max: 200, nullable: true, label: 'Empresa' },
  address:             { type: 'text', max: 500, nullable: true, label: 'Dirección' },
  postal_code:         { type: 'text', max: 10,  nullable: true, label: 'C.P.' },
  segment:             { type: 'text', max: 100, nullable: true, label: 'Tipo' },
  acquisition_channel: { type: 'text', max: 100, label: 'Canal' },
}

/** Valida un contacto y normaliza el teléfono al formato canónico de 10 dígitos. */
export function parseContact(body: Record<string, unknown>, partial = false): ParseResult {
  const parsed = parseFields(body, CONTACT_SCHEMA, { partial })
  if (!parsed.ok) return parsed
  if ('phone' in parsed.data) {
    const phone = normalizePhone(parsed.data.phone as string)
    if (phone.length !== 10) return { ok: false, error: 'El teléfono debe tener 10 dígitos' }
    parsed.data.phone = phone
  }
  return parsed
}

export function duplicateContactMessage(dbMessage = ''): string {
  const field = dbMessage.includes('phone') ? 'número de teléfono' : dbMessage.includes('email') ? 'correo' : 'dato'
  return `Ya existe un contacto con este ${field}`
}

/**
 * Vincula a los contactos recién creados/editados los mensajes de WhatsApp
 * de su número que llegaron cuando aún no estaban registrados.
 */
export async function linkWhatsAppMessages(storeId: string, contacts: { id: string; phone: string }[]) {
  await Promise.all(contacts.map(c =>
    getServerSupabase()
      .from('whatsapp_messages')
      .update({ contact_id: c.id })
      .eq('store_id', storeId)
      .eq('phone', normalizePhone(c.phone))
      .is('contact_id', null),
  ))
}
