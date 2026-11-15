/**
 * Utilidades de teléfono compartidas por cliente y servidor (sin 'use client'
 * para poder importarlas desde API routes). El formato canónico en la base
 * de datos es de 10 dígitos nacionales (ej. 2221234567); WhatsApp usa E.164
 * sin "+" (ej. 522221234567). Un chat de otro país se guarda con su lada
 * completa (ej. 15551234567): ver waChatPhone.
 */

/** Normaliza cualquier formato (52…, 521…, +52 …, 1…) a 10 dígitos. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('521') && digits.length === 13) return digits.slice(3)
  if (digits.startsWith('52')  && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('1')   && digits.length === 11) return digits.slice(1)
  if (digits.length > 10) return digits.slice(-10)
  return digits
}

const onlyDigits = (raw: string | null | undefined) => String(raw ?? '').replace(/\D/g, '')

/**
 * Número GUARDADO de otro país: con su lada completa y sin «+» (15551234567).
 * Los de México siempre se guardan a 10 dígitos, así que cualquier otro largo
 * entre 11 y 15 que no empiece con 52 es extranjero. Solo para números ya
 * guardados (chats, contactos), no para lo que alguien escribe a mano.
 */
export function isForeignPhone(raw: string | null | undefined): boolean {
  const d = onlyDigits(raw)
  return d.length >= 11 && d.length <= 15 && !d.startsWith('52')
}

/**
 * Número de un chat tal como llega de WhatsApp (E.164 sin «+»): los de
 * México a 10 dígitos, como en Contactos; los de otro país completos, para
 * no confundirlos con un número mexicano al contestar. '' si no sirve.
 */
export function waChatPhone(raw: string | null | undefined): string {
  const d = onlyDigits(raw)
  if (d.length === 10) return d
  if (d.startsWith('52') && (d.length === 12 || d.length === 13)) return normalizePhone(d)
  return d.length >= 11 && d.length <= 15 ? d : ''
}

/** Número para la API de WhatsApp: 52 + 10 dígitos, o el de otro país tal cual. */
export function toWhatsAppNumber(raw: string): string {
  if (isForeignPhone(raw)) return onlyDigits(raw)
  const d = normalizePhone(raw)
  return d.length === 10 ? `52${d}` : d
}

/** Abre el chat en la app de WhatsApp del celular (en computadora, WhatsApp Web o de escritorio). */
export const waMeLink = (raw: string) => `https://wa.me/${toWhatsAppNumber(raw)}`

/**
 * Variantes con las que un mismo número pudo haberse guardado (datos
 * heredados): la regla de «es el mismo número» al buscar un contacto por su
 * teléfono (bandeja, webhook, envío). Úsala en vez de escribir las variantes.
 */
export function phoneVariants(raw: string): string[] {
  // Uno de otro país nunca es el mismo que un contacto (los contactos son de México)
  if (isForeignPhone(raw)) return [onlyDigits(raw)]
  const d = normalizePhone(raw)
  if (d.length !== 10) return d ? [d] : []
  return [d, `52${d}`, `521${d}`]
}

/** Formatea teléfono 10 dígitos → XXX XXX XXXX; uno de otro país → +15551234567 */
export function fmtPhone(phone: string | null | undefined): string {
  if (isForeignPhone(phone)) return `+${onlyDigits(phone)}`
  const d = normalizePhone(phone)
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return phone || ''
}
