/**
 * Utilidades de teléfono compartidas por cliente y servidor (sin 'use client'
 * para poder importarlas desde API routes). El formato canónico en la base
 * de datos es de 10 dígitos nacionales (ej. 2221234567); WhatsApp usa E.164
 * sin "+" (ej. 522221234567).
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

/** Número para la API de WhatsApp: 52 + 10 dígitos. */
export function toWhatsAppNumber(raw: string): string {
  const d = normalizePhone(raw)
  return d.length === 10 ? `52${d}` : d
}

/** Variantes con las que un mismo número pudo haberse guardado (datos heredados). */
export function phoneVariants(raw: string): string[] {
  const d = normalizePhone(raw)
  if (d.length !== 10) return d ? [d] : []
  return [d, `52${d}`, `521${d}`]
}

/** Formatea teléfono 10 dígitos → XXX XXX XXXX */
export function fmtPhone(phone: string | null | undefined): string {
  const d = normalizePhone(phone)
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return phone || ''
}
