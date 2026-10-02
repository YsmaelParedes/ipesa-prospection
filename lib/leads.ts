import type { Schema } from './validation'
import { getServerSupabase, type StoreContext } from './supabase-server'

export const LEAD_ESTADOS = ['Nuevo', 'En seguimiento', 'Cotizado', 'Ganado / Venta realizada', 'Perdido'] as const
export const ACTIVITY_TYPES = ['call', 'email', 'whatsapp', 'quote', 'meeting', 'visit', 'note'] as const
export const REMINDER_TYPES = ['task', 'call', 'email', 'whatsapp', 'meeting'] as const
export const REMINDER_PRIORITIES = ['low', 'medium', 'high'] as const

/** Columnas editables de `leads` (lista blanca + validación). */
export const LEAD_SCHEMA: Schema = {
  name:       { type: 'text', max: 200, required: true, label: 'Nombre' },
  email:      { type: 'text', max: 254, label: 'Correo' },
  phone:      { type: 'text', max: 30, label: 'Teléfono' },
  canal:      { type: 'text', max: 100, label: 'Canal' },
  segmento:   { type: 'text', max: 100, label: 'Segmento' },
  estado:     { type: 'enum', values: LEAD_ESTADOS, label: 'Estado' },
  monto:      { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Monto' },
  notas:      { type: 'text', max: 5000, nullable: true, label: 'Notas' },
  fecha:      { type: 'date', label: 'Fecha' },
  contact_id: { type: 'uuid', nullable: true, label: 'Contacto' },
}

/**
 * ¿Puede este usuario ver/editar el lead? Solo leads de la tienda activa.
 * Dueño/admin: todos. Vendedor: los suyos y los heredados sin dueño
 * (user_id NULL, de antes del modo multiusuario).
 * Devuelve el lead (id, user_id, name) o null si no existe / no tiene acceso.
 */
export async function getAccessibleLead(ctx: StoreContext, leadId: string) {
  const { data } = await getServerSupabase().from('leads').select('id, user_id, name')
    .eq('id', leadId).eq('store_id', ctx.storeId).maybeSingle()
  if (!data) return null
  if (!ctx.isAdmin && data.user_id && data.user_id !== ctx.uid) return null
  return data
}

/** ¿El contacto pertenece a la tienda? (antes de ligarlo a un lead) */
export async function contactInStore(storeId: string, contactId: string): Promise<boolean> {
  const { data } = await getServerSupabase().from('contacts').select('id').eq('id', contactId).eq('store_id', storeId).maybeSingle()
  return !!data
}

/** Filtro PostgREST de visibilidad para empleados (uid viene de la sesión, no del cliente). */
export const ownLeadsFilter = (uid: string) => `user_id.eq.${uid},user_id.is.null`
