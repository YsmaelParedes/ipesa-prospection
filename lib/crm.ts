/**
 * Reglas del CRM compartidas por cliente y servidor (sin dependencias de
 * Node ni de React): etapas de un lead y tipos de actividad y recordatorio.
 */

export const LEAD_ESTADOS = ['Nuevo', 'En seguimiento', 'Cotizado', 'Ganado / Venta realizada', 'Perdido'] as const
export const WON  = 'Ganado / Venta realizada'
export const LOST = 'Perdido'
export const OPEN_ESTADOS = ['Nuevo', 'En seguimiento', 'Cotizado']
/** Abierto = todavía se puede ganar (ni ganado ni perdido). */
export const isOpenLead = (estado: string | null | undefined) => estado !== WON && estado !== LOST

export const ACTIVITY_TYPES = ['call', 'email', 'whatsapp', 'quote', 'meeting', 'visit', 'note'] as const
export const REMINDER_TYPES = ['task', 'call', 'email', 'whatsapp', 'meeting'] as const
export const REMINDER_PRIORITIES = ['low', 'medium', 'high'] as const
export type ReminderType = typeof REMINDER_TYPES[number]
export type ReminderPriority = typeof REMINDER_PRIORITIES[number]

export const REMINDER_TYPE_INFO: Record<ReminderType, { label: string; emoji: string; color: string; bg: string }> = {
  task:     { label: 'Tarea',    emoji: '📋', color: 'var(--c-purple-ink)',  bg: 'var(--c-purple-soft)' },
  call:     { label: 'Llamada',  emoji: '📞', color: 'var(--c-cyan-ink)',    bg: 'var(--c-cyan-soft)' },
  email:    { label: 'Correo',   emoji: '📧', color: 'var(--c-magenta-ink)', bg: 'var(--c-magenta-soft)' },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: '#128C4A',              bg: '#E3F7EA' },
  meeting:  { label: 'Reunión',  emoji: '🤝', color: 'var(--warning)',       bg: 'var(--warning-soft)' },
}
export const remTypeInfo = (key?: string | null) => REMINDER_TYPE_INFO[key as ReminderType] ?? REMINDER_TYPE_INFO.task

export const PRIORITY_INFO: Record<ReminderPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Baja',  color: 'var(--muted)',  bg: 'var(--paper)' },
  medium: { label: 'Media', color: 'var(--brand)',  bg: 'var(--brand-soft)' },
  high:   { label: 'Alta',  color: 'var(--danger)', bg: 'var(--danger-soft)' },
}

/** Recordatorio tal como lo devuelve /api/data/reminders. */
export type Reminder = {
  id: string
  lead_id: string | null
  lead_name: string
  nota: string
  fecha_recordatorio: string
  completado: boolean
  completado_at: string | null
  created_at?: string
  type?: string | null
  priority?: string | null
  /** false = lo creó otra persona del equipo (solo su autor lo puede editar) */
  mine?: boolean
  owner_name?: string | null
}

/** Lo mínimo de un contacto para ligarle un lead o un recordatorio. */
export type ContactLite = {
  id: string
  name: string
  phone: string
  email?: string | null
  company?: string | null
  segment?: string | null
  acquisition_channel?: string | null
}

/** Título de un recordatorio y, aparte, de quién es (si no es lo mismo). */
export function reminderTitle(r: Pick<Reminder, 'nota' | 'lead_name'>) {
  return r.nota?.trim() || r.lead_name?.trim() || 'Recordatorio'
}
export function reminderSubject(r: Pick<Reminder, 'nota' | 'lead_name'>) {
  const name = r.lead_name?.trim()
  return name && name !== r.nota?.trim() ? name : null
}
