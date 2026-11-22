/**
 * Productos: lo que comparten la lista, la ficha, el formulario, la
 * importación, las cotizaciones y el servidor. Funciones puras, sin red.
 *
 * Los precios se guardan CON IVA, como en un punto de venta (`prices`: id de
 * lista → precio). Una cotización trabaja sin IVA y lo suma al final, así que
 * al pasar un producto a una cotización se le quita (netPrice).
 * Gemelas en la base: supabase/migrations/*_productos.sql.
 */

export type ProductKind = 'product' | 'service'

export type PriceList = { id: string; name: string; is_main: boolean }

export type Product = {
  id: string
  kind: ProductKind
  name: string
  /** Clave con la que se reconoce al volver a importar (el «Identificador» de Pulpos). */
  ext_key: string | null
  sku: string | null
  barcode: string | null
  category: string | null
  brand: string | null
  unit: string | null
  description: string | null
  /** Con IVA. Solo lo ven los administradores (null para los demás). */
  cost: number | null
  tax_rate: number
  /** Solo de consulta: se actualiza al importar o editar. Los servicios no llevan. */
  stock: number | null
  prices: Record<string, number>
  created_at: string
  updated_at: string
}

type Num = number | string | null | undefined
/** Un producto tal como sale de la base (los números pueden venir como texto). */
export type ProductRow = Omit<Product, 'cost' | 'tax_rate' | 'stock' | 'prices'> & {
  cost: Num; tax_rate: number | string; stock: Num; prices: Record<string, Num> | null
}
const toNum = (v: Num) => (v === null || v === undefined || v === '' ? null : Number(v))

/** De la base a la app: números de verdad y, si no `withCost`, sin costo (quien no es administrador). */
export function productFromRow(r: ProductRow, withCost: boolean): Product {
  const prices: Record<string, number> = {}
  for (const [k, v] of Object.entries(r.prices ?? {})) {
    const n = toNum(v)
    if (n !== null && Number.isFinite(n)) prices[k] = n
  }
  return {
    id: r.id, kind: r.kind === 'service' ? 'service' : 'product', name: r.name, ext_key: r.ext_key ?? null, sku: r.sku ?? null,
    barcode: r.barcode ?? null, category: r.category ?? null, brand: r.brand ?? null, unit: r.unit ?? null, description: r.description ?? null,
    cost: withCost ? toNum(r.cost) : null,
    tax_rate: Number(r.tax_rate) || 0,
    stock: r.kind === 'service' ? null : toNum(r.stock),
    prices, created_at: r.created_at, updated_at: r.updated_at,
  }
}

export const TAX_RATES = [16, 8, 0] as const
export const MAX_PRICE_LISTS = 20
export const PRODUCT_PAGE = 50
/** Productos por petición al importar (la base acepta hasta 1,000). */
export const IMPORT_CHUNK = 500
export const PRODUCT_MAX = { name: 300, ext_key: 200, sku: 80, barcode: 80, category: 100, brand: 100, unit: 40, description: 2000, listName: 80 } as const
export const MAX_PRICE = 100_000_000

export const PRODUCT_ORDERS = [
  { value: 'name', label: 'Nombre A–Z' },
  { value: 'name_desc', label: 'Nombre Z–A' },
  { value: 'recent', label: 'Más recientes' },
] as const
export type ProductOrder = typeof PRODUCT_ORDERS[number]['value']

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Precio sin IVA a partir del precio con IVA (lo que entra a una cotización). */
export const netPrice = (withTax: number, taxRate: number) => round2(withTax / (1 + (Number(taxRate) || 0) / 100))
/** Precio con IVA a partir del precio sin IVA (archivos con precios sin IVA). */
export const grossPrice = (net: number, taxRate: number) => round2(net * (1 + (Number(taxRate) || 0) / 100))

/** La lista principal (si por algo no hay, la primera). */
export const mainListOf = <T extends PriceList>(lists: T[]): T | null => lists.find(l => l.is_main) ?? lists[0] ?? null

/**
 * Precio con IVA de un producto en una lista. Si no tiene precio en esa lista
 * se usa el de la principal y `fallback` lo dice («precio de Público»).
 */
export function priceIn(p: Pick<Product, 'prices'>, listId: string | null | undefined, mainId: string | null | undefined): { price: number | null; fallback: boolean } {
  const own = listId ? p.prices[listId] : undefined
  if (typeof own === 'number') return { price: own, fallback: false }
  const main = mainId ? p.prices[mainId] : undefined
  return typeof main === 'number' ? { price: main, fallback: !!listId && listId !== mainId } : { price: null, fallback: false }
}

/** Ganancia y margen de un precio contra el costo (los dos con IVA), como en el punto de venta. */
export function marginOf(price: number | null | undefined, cost: number | null | undefined): { gain: number; pct: number } | null {
  if (!price || price <= 0 || cost === null || cost === undefined) return null
  const gain = round2(price - cost)
  return { gain, pct: Math.round((gain / price) * 100) }
}

const qtyFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 })

/** «14 pieza», «0 galón»; null para un servicio o si no hay dato. */
export function stockLabel(p: Pick<Product, 'kind' | 'stock' | 'unit'>): string | null {
  if (p.kind === 'service' || p.stock === null || p.stock === undefined) return null
  return `${qtyFmt.format(p.stock)}${p.unit ? ` ${p.unit.toLowerCase()}` : ''}`
}

/** Unidad para un renglón de cotización (minúsculas, hasta 20 letras). */
export const quoteUnit = (unit: string | null | undefined) => (unit ?? '').trim().toLowerCase().slice(0, 20)

/** Sin acentos ni mayúsculas, espacios simples. */
export const normText = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/* ── Importar ─────────────────────────────────────────────────────────────── */

export type ImportField = 'name' | 'key' | 'kind' | 'sku' | 'barcode' | 'category' | 'brand' | 'unit' | 'description' | 'stock' | 'cost' | 'tax_rate'

/**
 * Datos que se pueden importar, en el orden del paso «Columnas», y los
 * nombres de columna con que se reconocen (los de Pulpos y los de nuestra
 * descarga, que se puede volver a subir).
 */
export const IMPORT_FIELDS: { field: ImportField; label: string; guesses: string[] }[] = [
  { field: 'name', label: 'Nombre', guesses: ['nombre del producto', 'nombre', 'producto', 'articulo', 'name'] },
  { field: 'key', label: 'Clave para actualizar', guesses: ['clave', 'identificador', 'id'] },
  { field: 'kind', label: 'Producto o servicio', guesses: ['es un servicio', 'tipo', 'servicio'] },
  { field: 'sku', label: 'SKU', guesses: ['sku'] },
  { field: 'barcode', label: 'Código de barras', guesses: ['codigo de barras', 'ean', 'upc', 'barcode'] },
  { field: 'category', label: 'Categoría', guesses: ['categoria', 'linea', 'familia', 'departamento'] },
  { field: 'brand', label: 'Marca', guesses: ['marca', 'fabricante'] },
  { field: 'unit', label: 'Unidad', guesses: ['unidad de venta', 'unidad', 'presentacion'] },
  { field: 'description', label: 'Descripción', guesses: ['descripcion', 'detalle'] },
  { field: 'stock', label: 'Existencias', guesses: ['existencias', 'stock total', 'existencia', 'stock', 'inventario'] },
  { field: 'cost', label: 'Costo', guesses: ['costo', 'precio de compra', 'costo unitario'] },
  { field: 'tax_rate', label: 'IVA', guesses: ['iva', 'tasa de iva'] },
]

/** Columnas que se parecen a un dato pero no lo son (no se sugieren). */
const NOT_A_FIELD = ['clave sat', 'clave prod', 'clave unidad', 'stock minimo', 'stock apartado', 'utiliza stock']

const isPriceHeader = (h: string) => {
  const n = normText(h)
  return /^precios?\b/.test(n) && !n.startsWith('precio de compra')
}

/**
 * Qué columna del archivo va a cada dato: primero las que se llaman igual,
 * luego las que empiezan igual. Una columna no se usa dos veces y las de
 * precio quedan para las listas.
 */
export function guessMapping(headers: string[]): Partial<Record<ImportField, string>> {
  const out: Partial<Record<ImportField, string>> = {}
  const used = new Set<string>()
  const candidates = headers.filter(h => h.trim() && !isPriceHeader(h) && !NOT_A_FIELD.some(x => normText(h).startsWith(x)))
  for (const exact of [true, false]) {
    for (const { field, guesses } of IMPORT_FIELDS) {
      if (out[field]) continue
      const hit = guesses.map(g => candidates.find(h => !used.has(h) && (exact ? normText(h) === g : normText(h).startsWith(`${g} `) || normText(h).startsWith(`${g}(`)))).find(Boolean)
      if (hit) { out[field] = hit; used.add(hit) }
    }
  }
  return out
}

/** «Precio Precio tarjeta débito o crédito» → «Tarjeta débito o crédito»; «Precio» o «Precio de venta» → «Público». */
export function listNameOf(header: string): string {
  const rest = header.trim().replace(/^((precios?)\s*)+/i, '').trim()
  const n = normText(rest)
  if (!n || n === 'de venta' || n === 'venta' || n === 'publico' || n === 'al publico' || n === 'publico general') return 'Público'
  return (rest.charAt(0).toUpperCase() + rest.slice(1)).slice(0, PRODUCT_MAX.listName)
}

/**
 * Fila de los encabezados en una hoja: la primera con al menos dos celdas
 * llenas. El Excel de Pulpos deja las dos primeras filas vacías y otros
 * archivos traen un título arriba de la tabla.
 */
export function headerRowIndex(grid: unknown[][]): number {
  const filled = (row: unknown[] | undefined) => (row ?? []).filter(v => String(v ?? '').trim() !== '').length
  const i = grid.findIndex(row => filled(row) >= 2)
  return i >= 0 ? i : grid.findIndex(row => filled(row) >= 1)
}

/** Las columnas de precio del archivo, cada una con el nombre de lista que se propone. */
export const priceColumnsOf = (headers: string[]) =>
  headers.filter(h => h.trim() && isPriceHeader(h)).map(header => ({ header, name: listNameOf(header) }))

/** «$1,234.50», «1234,5»… → número; null si no hay o no es número. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.replace(/[$\s]/g, '').replace(/%$/, '')
  if (!t) return null
  // «1,234.50» (comas de miles) o «1234,5» (coma decimal)
  const clean = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

/** 0.16, «16 %», 16 → 16; «Exento», «No aplica», 0 → 0; otro valor → null. */
export function parseTax(v: unknown): 0 | 8 | 16 | null {
  const t = normText(v)
  if (['exento', 'no aplica', 'no', 'sin iva', 'tasa 0'].includes(t)) return 0
  const n = parseNumber(typeof v === 'string' ? v.replace(/iva/i, '') : v)
  if (n === null) return null
  const pct = n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n)
  return pct === 0 || pct === 8 || pct === 16 ? pct : null
}

/** «Sí» / «Servicio» → servicio; «No» / «Producto» → producto; otro valor → sin dato. */
export function parseKind(v: unknown): ProductKind | undefined {
  const t = normText(v)
  if (['si', 'servicio', 'service', 'true', '1', 'x', 'yes'].includes(t)) return 'service'
  if (['no', 'producto', 'product', 'false', '0'].includes(t)) return 'product'
  return undefined
}

const text = (v: unknown, max: number): string | undefined => {
  if (v === null || v === undefined) return undefined
  const t = String(v).trim()
  return t ? t.slice(0, max) : undefined
}

/** Un producto tal como se manda a importar (lo vacío no se manda: no borra). */
export type ImportItem = {
  key?: string; sku?: string; name?: string; kind?: ProductKind; barcode?: string; category?: string; brand?: string
  unit?: string; description?: string; stock?: number; cost?: number; tax_rate?: 0 | 8 | 16
  /** Un precio por lista, en el orden de `lists` (null = sin precio en esa lista). */
  prices: (number | null)[]
}

export type ImportPlan = {
  /** Nombres de las listas, sin repetir. */
  lists: string[]
  items: ImportItem[]
  /** Filas sin nombre, clave ni SKU: no se pueden crear ni reconocer. */
  skipped: number
}

/**
 * De las filas del archivo a lo que se importa. `priceCols`: cada columna de
 * precio con el nombre de su lista (vacío = no se importa). Con
 * `pricesIncludeTax` en false, precios y costo se pasan a precio con IVA.
 */
export function buildImport(
  rows: Record<string, unknown>[],
  mapping: Partial<Record<ImportField, string>>,
  priceCols: { header: string; name: string }[],
  opts: { pricesIncludeTax: boolean },
): ImportPlan {
  const lists: string[] = []
  const colList = priceCols.map(c => {
    const name = c.name.trim().slice(0, PRODUCT_MAX.listName)
    if (!name) return -1
    const i = lists.findIndex(l => normText(l) === normText(name))
    if (i >= 0) return i
    lists.push(name)
    return lists.length - 1
  })
  const cell = (row: Record<string, unknown>, f: ImportField) => (mapping[f] ? row[mapping[f]!] : undefined)
  const items: ImportItem[] = []
  let skipped = 0
  for (const row of rows) {
    const tax = parseTax(cell(row, 'tax_rate'))
    const toGross = (n: number | null) => (n === null ? null : opts.pricesIncludeTax ? round2(n) : grossPrice(n, tax ?? 16))
    const item: ImportItem = { prices: lists.map(() => null) }
    const put = <K extends keyof ImportItem>(k: K, v: ImportItem[K] | undefined) => { if (v !== undefined) item[k] = v }
    put('name', text(cell(row, 'name'), PRODUCT_MAX.name))
    put('key', text(cell(row, 'key'), PRODUCT_MAX.ext_key))
    put('sku', text(cell(row, 'sku'), PRODUCT_MAX.sku))
    put('kind', parseKind(cell(row, 'kind')))
    put('barcode', text(cell(row, 'barcode'), PRODUCT_MAX.barcode))
    put('category', text(cell(row, 'category'), PRODUCT_MAX.category))
    put('brand', text(cell(row, 'brand'), PRODUCT_MAX.brand))
    put('unit', text(cell(row, 'unit'), PRODUCT_MAX.unit))
    put('description', text(cell(row, 'description'), PRODUCT_MAX.description))
    const stock = parseNumber(cell(row, 'stock'))
    if (stock !== null && item.kind !== 'service') item.stock = stock
    const cost = toGross(parseNumber(cell(row, 'cost')))
    if (cost !== null && cost >= 0 && cost <= MAX_PRICE) item.cost = cost
    if (tax !== null) item.tax_rate = tax
    priceCols.forEach((c, i) => {
      const li = colList[i]
      if (li < 0) return
      const p = toGross(parseNumber(row[c.header]))
      if (p !== null && p >= 0 && p <= MAX_PRICE) item.prices[li] = p
    })
    if (!item.name && !item.key && !item.sku) { skipped++; continue }
    items.push(item)
  }
  return { lists, items, skipped }
}

/* ── Descargar ────────────────────────────────────────────────────────────── */

/**
 * Renglones del Excel de productos: las mismas columnas que se reconocen al
 * importar, así se puede editar y volver a subir. La clave es la de origen o,
 * si se creó en Matices, su id.
 */
export function productRows(products: Product[], lists: PriceList[], opts: { withCost: boolean }) {
  return products.map(p => ({
    'Nombre': p.name,
    'Clave': p.ext_key ?? p.id,
    'Tipo': p.kind === 'service' ? 'Servicio' : 'Producto',
    'SKU': p.sku ?? '',
    'Código de barras': p.barcode ?? '',
    'Categoría': p.category ?? '',
    'Marca': p.brand ?? '',
    'Unidad': p.unit ?? '',
    'Descripción': p.description ?? '',
    'Existencias': p.kind === 'service' || p.stock === null ? '' : p.stock,
    ...(opts.withCost ? { 'Costo': p.cost ?? '' } : {}),
    'IVA': p.tax_rate,
    ...Object.fromEntries(lists.map(l => [`Precio ${l.name}`, p.prices[l.id] ?? ''])),
  }))
}
