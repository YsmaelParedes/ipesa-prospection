/**
 * Calidad de direcciones para el sistema comercial (cliente y servidor, sin
 * dependencias). Las direcciones llegan en dos formas:
 *   · ordenada:  "CALLE, NÚMERO, COLONIA, CP 72830"
 *   · copiada de Google Maps: "Ferretería  4.6(58)Ferretería · Calle 30 Nte. 1403Abierto · Cierra a las 5 p.m. · 221 823 6526"
 */

const HOURS = /(abierto|cerrado|abre|cierra)\b.*$/i
const HOUR_ONLY = /^\d{1,2}(:\d{2})?\s*[ap]\.?\s?m\.?/i
const MAPS_JUNK = /(î.*|\s*sitio web.*|\s*indicaciones.*)$/i
const GLUED_PHONE = /(\+\d{1,3}\s?)?\d{2,3}\s\d{3,4}\s\d{4}$/
const PHONE_ONLY = /^\+?[\d\s().-]{10,}$/

/** Quita el nombre, el giro, el horario y el teléfono del texto copiado de Google Maps. */
export function cleanAddress(raw: string | null | undefined): string {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text.includes('·')) return text
  // "Nombre 4.6(9)Giro · [📍 ·] Dirección[Horario] · Teléfono"
  return text.split('·').slice(1)
    .map(p => p.replace(MAPS_JUNK, '').replace(HOURS, '').trim().replace(GLUED_PHONE, '').trim())
    .filter(p => /[\p{L}\p{N}]/u.test(p) && !PHONE_ONLY.test(p) && !HOUR_ONLY.test(p))
    .join(', ')
}

const parts = (address: string) => address.split(',').map(p => p.trim()).filter(Boolean)
const NUMBER_PART = /^(#\s*)?(\d+\s*[a-z]?(\s*-\s*\d+)?|s\/?n)$/i
const CP = /\bc\.?\s?p\.?\s*\d{5}/gi
// Números que son parte del nombre de la calle, no de la casa: "Calle 36 Pte.", "C. 16 de Septiembre"
const STREET_NAME_NUMBER = /\b\d{1,3}\s*[a-z]?\s*(pte|poniente|ote|oriente|sur|nte|norte)\b\.?|\b\d{1,2}\s+de\s+\p{L}+/giu

/**
 * ¿Tiene calle y número real? "0", "S/N", solo el código postal o solo el
 * número del nombre de la calle no cuentan. En la forma ordenada el número es
 * la segunda parte.
 */
export function hasStreetNumber(raw: string | null | undefined): boolean {
  const address = cleanAddress(raw)
  if (address.length < 6 || !/\p{L}{3,}/u.test(address)) return false
  const p = parts(address)
  if (p.length >= 3 && NUMBER_PART.test(p[1])) {
    const n = p[1].replace(/^#\s*/, '')
    return !/^s\/?n$/i.test(n) && Number.parseInt(n, 10) > 0
  }
  // El código postal va marcado "CP" o al inicio de una parte ("…, 72490 Heroica Puebla"); un
  // número de casa también puede tener 5 dígitos ("17 Sur 13928")
  const rest = p.map(x => x.replace(CP_PART, ' ')).join(', ')
    .replace(CP, ' ').replace(/\bs\/?n\b/gi, ' ').replace(STREET_NAME_NUMBER, ' calle ')
  return /[\p{L}.]\s*(#|no\.?|núm\.?|n°)?\s*0*[1-9]\d{0,5}/u.test(rest)
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
const CP_PART = /^(c\.?\s?p\.?\s*)?\d{5}\b/i
const STREET_PREFIX = /^(calle|c\.|av\.?|avenida|blvd\.?|boulevard|carr\.?|carretera|privada|prol\.?|prolongaci[oó]n)\s/i

/**
 * Colonia: tercera parte de la forma ordenada; si no, la parte justo antes del
 * último código postal; si no, lo que sigue a "Col." o "colonia".
 */
export function parseColonia(raw: string | null | undefined): string | null {
  const address = cleanAddress(raw)
  const p = parts(address)
  let colonia: string | undefined
  if (p.length >= 3 && NUMBER_PART.test(p[1]) && !CP_PART.test(p[2])) colonia = p[2]
  if (!colonia) {
    let cpAt = -1
    p.forEach((x, i) => { if (CP_PART.test(x)) cpAt = i })
    if (cpAt >= 1 && !/\d/.test(p[cpAt - 1])) colonia = p[cpAt - 1]
  }
  if (!colonia) colonia = /\b(?:col\.?|colonia)\s+([^,\d]+)/i.exec(address)?.[1]
  colonia = colonia?.trim()
  if (!colonia || colonia.length > 80 || /^ninguno$/i.test(colonia) || STREET_PREFIX.test(colonia)) return null
  return colonia === colonia.toUpperCase() || colonia === colonia.toLowerCase() ? titleCase(colonia) : colonia
}
