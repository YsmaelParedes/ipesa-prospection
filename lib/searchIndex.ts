import { apiFetch } from '@/lib/apiClient'
/**
 * Búsqueda de contactos para el buscador global, el selector de cliente y la
 * detección de duplicados. Ya no se baja toda la base: el servidor filtra
 * (sin acentos ni mayúsculas: "maria" encuentra "María") y aquí se ordenan
 * los resultados por qué tan bien coinciden.
 */
import { normalizePhone } from './phone'

export type IndexContact = {
  id: string; name: string; phone: string | null; email: string | null; company: string | null
  segment: string | null; acquisition_channel: string | null; wa_opt_out?: boolean
  commercial_status?: string; line_type?: string | null
}

export const normText = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const fetchContacts = (params: Record<string, string>): Promise<IndexContact[]> =>
  apiFetch(`/api/data/contacts?${new URLSearchParams({ fields: 'lite', ...params })}`)
    .then(r => (r.ok ? r.json() : { contacts: [] }))
    .then(d => d.contacts ?? [])

/** Los que coinciden con lo escrito, mejores primero. Con `withPhone`, solo los que tienen teléfono. */
export async function findContacts(q: string, limit = 6, opts: { withPhone?: boolean } = {}): Promise<IndexContact[]> {
  const text = q.trim()
  if (!text) return []
  // Con muchas coincidencias, los 50 más recientes podrían no traer el mejor: se piden aparte los que empiezan así
  const base = { q: text, ...(opts.withPhone ? { line: 'con_telefono' } : {}) }
  const [starts, any] = await Promise.all([fetchContacts({ ...base, prefix: '1', limit: '20' }), fetchContacts({ ...base, limit: '50' })])
  const seen = new Set(starts.map(c => c.id))
  return searchContacts([...starts, ...any.filter(c => !seen.has(c.id))], text, limit)
}

/** El contacto que ya tiene ese número (10 dígitos), o null. */
export async function findContactWithPhone(phone: string): Promise<IndexContact | null> {
  const p = normalizePhone(phone)
  if (p.length !== 10) return null
  return (await fetchContacts({ phone: p }))[0] ?? null
}

const tokens = (text: string) => normText(text).split(/[\s.,;:()/@_-]+/).filter(Boolean)
/** Cada palabra buscada es el inicio de alguna palabra del texto ("mari" → "María", no "Primaria"). */
const startsWords = (toks: string[], words: string[]) => words.every(w => toks.some(t => t.startsWith(w)))

/**
 * Puntaje de coincidencia (menor = mejor) o null si no coincide:
 * 0 el nombre empieza con lo buscado · 1 palabras del nombre · 2 empresa/correo · 3 teléfono.
 */
function score(name: string, extra: string, phone: string | null, q: string): number | null {
  const nq = normText(q)
  if (!nq) return null
  const words = nq.split(/\s+/)
  const nameToks = tokens(name)
  if (normText(name).startsWith(nq)) return 0
  if (startsWords(nameToks, words)) return 1
  if (extra && startsWords([...nameToks, ...tokens(extra)], words)) return 2
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 3 && normalizePhone(phone).includes(digits)) return 3
  return null
}

function rank<T>(list: T[], scoreOf: (item: T) => number | null, limit: number): T[] {
  const hits: { item: T; s: number }[] = []
  for (const item of list) {
    const s = scoreOf(item)
    if (s !== null) hits.push({ item, s })
  }
  return hits.sort((a, b) => a.s - b.s).slice(0, limit).map(h => h.item)
}

export function searchContacts(list: IndexContact[], q: string, limit = 6): IndexContact[] {
  return rank(list, c => score(c.name, `${c.company ?? ''} ${c.email ?? ''}`, c.phone, q), limit)
}

export function findContactByPhone(list: IndexContact[], phone: string): IndexContact | null {
  const p = normalizePhone(phone)
  if (p.length !== 10) return null
  return list.find(c => normalizePhone(c.phone) === p) ?? null
}
