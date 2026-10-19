import fs from 'node:fs'
import path from 'node:path'

export type Colourant = {
  code: string
  shotsPerLiter: number | null
  mlPerLiter: number | null
  needsReview: boolean
  raw: { '1L': number | null; '4L': number | null; '19L': number | null }
}

export type FormulaColor = {
  code: string
  name: string
  base: string
  colourants: Colourant[]
  /** Muestra de color extraída del PDF original, en formato "#rrggbb". */
  swatch?: string
}

export type FormulaCatalog = {
  id: string
  productLine: string
  fandeck: string
  unit: 'ml'
  sourceUnit: string
  colorCount: number
  colors: FormulaColor[]
}

export type CatalogManifestEntry = {
  id: string
  productLine: string
  fandeck: string
  file: string
}

const DATA_DIR = path.join(process.cwd(), 'data', 'formulas')

let manifestCache: CatalogManifestEntry[] | null = null

export function loadManifest(): CatalogManifestEntry[] {
  if (manifestCache) return manifestCache
  const raw = fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8')
  manifestCache = JSON.parse(raw)
  return manifestCache!
}

const catalogCache = new Map<string, FormulaCatalog>()

/**
 * Carga un catálogo por id. El id SIEMPRE se valida contra el manifiesto
 * antes de tocar el sistema de archivos — nunca se arma una ruta a partir
 * del parámetro de la URL directamente (evita path traversal).
 */
export function loadCatalog(catalogId: string): FormulaCatalog | null {
  const entry = loadManifest().find(c => c.id === catalogId)
  if (!entry) return null

  const cached = catalogCache.get(catalogId)
  if (cached) return cached

  const raw = fs.readFileSync(path.join(DATA_DIR, entry.file), 'utf8')
  const catalog = JSON.parse(raw) as FormulaCatalog
  catalogCache.set(catalogId, catalog)
  return catalog
}

export function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function searchColors(colors: FormulaColor[], query: string, limit = 60): FormulaColor[] {
  const q = normalize(query)
  if (!q) return colors.slice(0, limit)
  const out: FormulaColor[] = []
  for (const c of colors) {
    if (normalize(`${c.code} ${c.name}`).includes(q)) {
      out.push(c)
      if (out.length >= limit) break
    }
  }
  return out
}
