/**
 * Tipo de línea de un contacto (cliente y servidor). En la base, contacts.line_type:
 *  · 'whatsapp' — escribió por WhatsApp o le llegó un mensaje (se marca solo), o el vendedor lo confirmó.
 *  · 'fijo'     — Meta dijo que no tiene WhatsApp, o el vendedor lo marcó: hay que llamarle.
 *  · null       — sin verificar. Meta no deja preguntar si un número tiene WhatsApp sin mandarle algo.
 */
export const LINE_TYPES = ['whatsapp', 'fijo'] as const
export type LineType = typeof LINE_TYPES[number]

/** Filtro "Teléfono" de Contactos. */
export const PHONE_FILTERS = ['whatsapp', 'fijo', 'sin_verificar', 'sin_telefono'] as const
export type PhoneFilter = typeof PHONE_FILTERS[number]
export const PHONE_FILTER_LABELS: Record<PhoneFilter, string> = {
  whatsapp: 'Con WhatsApp',
  fijo: 'Fijo (sin WhatsApp)',
  sin_verificar: 'Sin verificar',
  sin_telefono: 'Sin teléfono',
}
export const isPhoneFilter = (v: unknown): v is PhoneFilter => typeof v === 'string' && (PHONE_FILTERS as readonly string[]).includes(v)

/** En qué grupo del filtro "Teléfono" cae un contacto. */
export function phoneKind(c: { phone: string | null; line_type?: string | null }): PhoneFilter {
  if (!c.phone) return 'sin_telefono'
  return c.line_type === 'whatsapp' || c.line_type === 'fijo' ? c.line_type : 'sin_verificar'
}
