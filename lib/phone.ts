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

export const isValidPhone10 = (raw: string) => /^\d{10}$/.test(normalizePhone(raw))

/**
 * Detecta si un teléfono mexicano (10 dígitos normalizados) es celular — apto para SMS/WhatsApp.
 * Usa rangos conservadores: solo marca como fijo los rangos claramente TELMEX/fijo.
 * Es preferible dejar pasar un fijo que bloquear un celular.
 */
export function isMobilePhone(phone: string): boolean {
  const d = normalizePhone(phone)
  if (d.length !== 10) return false
  // Toll-free / premium
  if (d.startsWith('800') || d.startsWith('900')) return false
  // Ladas de 2 dígitos — solo el rango clásico de fijo de cada ciudad:
  const lada2 = d.slice(0, 2)
  if (lada2 === '55') return d[2] !== '5'  // CDMX: 55 5xxx = fijo (TELMEX)
  if (lada2 === '33') return d[2] !== '3'  // Guadalajara: 33 3xxx = fijo
  if (lada2 === '81') return d[2] !== '8'  // Monterrey: 81 8xxx = fijo
  // Ladas de 3 dígitos (Puebla 222, Querétaro 442, Mérida 999, etc.)
  // Solo local que empieza con 2 es fijo (serie TELMEX típica).
  return d[3] !== '2'
}

/** Formatea teléfono 10 dígitos → XXX XXX XXXX */
export function fmtPhone(phone: string | null | undefined): string {
  const d = normalizePhone(phone)
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return phone || ''
}
