import { getServerSupabase } from './supabase-server'
import { parseFields, type ParseResult, type Schema } from './validation'
import { normalizePhone } from './phone'
import { PRIORITIES } from './commercial'

/** Columnas que se devuelven al cliente (sin columnas heredadas sin uso). */
export const CONTACT_COLUMNS = 'id, name, phone, email, company, address, postal_code, colonia, zone, segment, acquisition_channel, wa_opt_out, owner_id, commercial_status, next_action, next_action_at, last_note, priority, potential_monthly, origin, created_at, updated_at'

/** Columnas editables de `contacts` (lista blanca + validación). */
export const CONTACT_SCHEMA: Schema = {
  name:                { type: 'text', max: 200, required: true, label: 'Nombre' },
  // Sin teléfono = "Para visita" (entonces la dirección es obligatoria)
  phone:               { type: 'text', max: 30,  nullable: true, label: 'Teléfono' },
  email:               { type: 'text', max: 254, label: 'Correo', pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  company:             { type: 'text', max: 200, nullable: true, label: 'Empresa' },
  address:             { type: 'text', max: 500, nullable: true, label: 'Dirección' },
  postal_code:         { type: 'text', max: 10,  nullable: true, label: 'C.P.' },
  colonia:             { type: 'text', max: 120, nullable: true, label: 'Colonia' },
  zone:                { type: 'text', max: 60,  nullable: true, label: 'Zona' },
  priority:            { type: 'enum', values: PRIORITIES, label: 'Prioridad' },
  potential_monthly:   { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Potencial mensual' },
  origin:              { type: 'text', max: 60, nullable: true, label: 'Origen' },
  segment:             { type: 'text', max: 100, nullable: true, label: 'Tipo' },
  acquisition_channel: { type: 'text', max: 100, label: 'Canal' },
}

/**
 * Valida un contacto y normaliza el teléfono al formato canónico de 10
 * dígitos. Sin teléfono el contacto queda "Para visita" y necesita dirección
 * (al importar listas el teléfono sigue siendo obligatorio: es la llave para
 * no duplicar).
 */
export function parseContact(body: Record<string, unknown>, partial = false, opts: { requirePhone?: boolean } = {}): ParseResult {
  const parsed = parseFields(body, CONTACT_SCHEMA, { partial })
  if (!parsed.ok) return parsed
  if ('phone' in parsed.data) {
    const raw = parsed.data.phone as string | null
    if (raw === null || !raw.trim()) {
      parsed.data.phone = null
    } else {
      const phone = normalizePhone(raw)
      if (phone.length !== 10) return { ok: false, error: 'El teléfono debe tener 10 dígitos' }
      parsed.data.phone = phone
    }
  }
  if (!partial && !parsed.data.phone) {
    if (opts.requirePhone) return { ok: false, error: 'El teléfono es obligatorio' }
    if (!String(parsed.data.address ?? '').trim()) return { ok: false, error: 'Escribe el teléfono o, si no tiene, la dirección para visitarlo' }
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
export async function linkWhatsAppMessages(storeId: string, contacts: { id: string; phone: string | null }[]) {
  await Promise.all(contacts.filter(c => c.phone).map(c =>
    getServerSupabase()
      .from('whatsapp_messages')
      .update({ contact_id: c.id })
      .eq('store_id', storeId)
      .eq('phone', normalizePhone(c.phone))
      .is('contact_id', null),
  ))
}
