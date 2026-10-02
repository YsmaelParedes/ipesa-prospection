import type { Schema } from './validation'
import { REMINDER_PRIORITIES, REMINDER_TYPES } from './crm'

/**
 * La app usa `fecha_recordatorio`; la columna real es `reminder_date`
 * (timestamp SIN zona horaria con la hora local de México tal cual la
 * eligió el usuario — por eso se acepta solo "YYYY-MM-DDTHH:MM[:SS]").
 */
export const REMINDER_SCHEMA: Schema = {
  nota:               { type: 'text', max: 1000, label: 'Nota' },
  lead_id:            { type: 'uuid', nullable: true, label: 'Lead' },
  lead_name:          { type: 'text', max: 200, label: 'Nombre' },
  completado:         { type: 'bool', label: 'Completado' },
  fecha_recordatorio: { type: 'text', max: 19, label: 'Fecha', pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/ },
  type:               { type: 'enum', values: REMINDER_TYPES, label: 'Tipo' },
  priority:           { type: 'enum', values: REMINDER_PRIORITIES, label: 'Prioridad' },
}

export function reminderToApp<T extends Record<string, unknown>>(r: T) {
  const { reminder_date, ...rest } = r
  return { ...rest, fecha_recordatorio: reminder_date }
}

export function reminderToDB(data: Record<string, unknown>) {
  const { fecha_recordatorio, ...rest } = data
  return fecha_recordatorio !== undefined ? { ...rest, reminder_date: fecha_recordatorio } : rest
}
