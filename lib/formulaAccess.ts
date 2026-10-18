/**
 * Fórmulas accesibles en planes con límite (Litro: 20). Cada tienda tiene
 * siempre las mismas, elegidas "al azar" de forma estable: se ordenan todos
 * los colores de todos los catálogos por sha256(tienda:catálogo:código) y se
 * toman los primeros. Otra tienda obtiene otras. Solo servidor.
 */
import { createHash } from 'node:crypto'

export type CatalogCodes = { id: string; codes: string[] }

/** Códigos permitidos por catálogo para una tienda (null = todas). */
export function pickFormulas(storeId: string, catalogs: CatalogCodes[], limit: number | null): Map<string, Set<string>> | null {
  if (limit === null) return null
  const scored: { catalog: string; code: string; key: string }[] = []
  for (const c of catalogs) {
    for (const code of c.codes) {
      scored.push({ catalog: c.id, code, key: createHash('sha256').update(`${storeId}:${c.id}:${code}`).digest('hex') })
    }
  }
  scored.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const out = new Map<string, Set<string>>(catalogs.map(c => [c.id, new Set<string>()]))
  for (const item of scored.slice(0, Math.max(0, limit))) out.get(item.catalog)!.add(item.code)
  return out
}

const cache = new Map<string, Map<string, Set<string>> | null>()

/** pickFormulas con caché en memoria por tienda y límite (los catálogos no cambian en ejecución). */
export function allowedFormulas(storeId: string, limit: number | null, loadCatalogs: () => CatalogCodes[]): Map<string, Set<string>> | null {
  if (limit === null) return null
  const key = `${storeId}:${limit}`
  if (!cache.has(key)) {
    if (cache.size > 2000) cache.clear()
    cache.set(key, pickFormulas(storeId, loadCatalogs(), limit))
  }
  return cache.get(key)!
}
