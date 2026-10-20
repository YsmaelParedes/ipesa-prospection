import { apiFetch } from '@/lib/apiClient'
/**
 * Índice en memoria de contactos para el buscador global, el selector de
 * cliente y la detección de duplicados. Se descarga la primera vez que se usa
 * y se vuelve a pedir cuando cambian los contactos.
 * Busca sin acentos ni mayúsculas ("maria" encuentra "María").
 */
import { normalizePhone } from './phone'

export type IndexContact = {
  id: string; name: string; phone: string; email: string | null; company: string | null
  segment: string | null; acquisition_channel: string | null; wa_opt_out?: boolean
  commercial_status?: string
}
export type SearchIndex = { contacts: IndexContact[] }

export const normText = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export function loadSearchIndex(): Promise<SearchIndex> {
  return apiFetch('/api/data/contacts')
    .then(r => (r.ok ? r.json() : { contacts: [] }))
    .then(c => ({ contacts: c.contacts ?? [] }))
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
