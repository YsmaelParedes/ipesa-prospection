/**
 * Búsqueda de contactos en la base (solo servidor): sin acentos ni mayúsculas
 * y palabra por palabra sobre contacts.search_text ("jose perez" encuentra
 * "Pinturas Pérez · José"). Si se escriben solo números (3 o más), busca en el
 * teléfono. La usan Contactos, el buscador y la lista de Hoy.
 */

/** "José Pérez" → ['jose', 'perez'] (como contacts.search_text). */
export const searchWords = (q: string) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ@. ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)

type Filterable = { ilike: (column: string, pattern: string) => Filterable }

/**
 * Aplica la búsqueda a una consulta de contacts. Con `prefix`, la primera
 * palabra debe ser el inicio del texto (el nombre empieza con ella).
 */
export function withContactSearch<Q>(query: Q, raw: string | null | undefined, opts: { prefix?: boolean } = {}): Q {
  const text = (raw ?? '').slice(0, 80)
  const digits = text.replace(/\D/g, '')
  let r = query as unknown as Filterable
  if (digits.length >= 3 && !/[a-zA-ZÀ-ſ]/.test(text)) return r.ilike('phone', `%${digits}%`) as unknown as Q
  searchWords(text).forEach((w, i) => { r = r.ilike('search_text', opts.prefix && i === 0 ? `${w}%` : `%${w}%`) })
  return r as unknown as Q
}
