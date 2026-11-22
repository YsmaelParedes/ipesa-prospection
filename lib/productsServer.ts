/**
 * Productos (solo servidor): lectura, validación del formulario y listas de
 * precios. Todo el equipo ve y busca; solo los administradores cambian algo
 * y ven el costo (a los demás les llega en null).
 */
import { getServerSupabase, type StoreContext } from './supabase-server'
import { parseFields, type Schema } from './validation'
import { MAX_PRICE, PRODUCT_MAX, productFromRow, type PriceList, type Product, type ProductRow } from './products'

export type { ProductRow } from './products'

export const PRODUCT_COLUMNS =
  'id, kind, name, ext_key, sku, barcode, category, brand, unit, description, cost, tax_rate, stock, prices, created_at, updated_at'

/** Lo que recibe el navegador: números de verdad y sin costo para quien no es administrador. */
export const productToClient = (r: ProductRow, isAdmin: boolean): Product => productFromRow(r, isAdmin)

/** La tienda tiene al menos su lista Público (la migración y el alta de tienda la crean; esto es por si acaso). */
export async function getPriceLists(storeId: string): Promise<PriceList[]> {
  const db = getServerSupabase()
  const read = () => db.from('price_lists').select('id, name, is_main, created_at').eq('store_id', storeId)
    .order('is_main', { ascending: false }).order('created_at', { ascending: true }).order('name', { ascending: true })
  let { data, error } = await read()
  if (error) throw error
  if (!data?.length) {
    const made = await db.rpc('ensure_price_lists', { p_store: storeId, p_names: ['Público'] })
    if (made.error) throw made.error
    ;({ data, error } = await read())
    if (error) throw error
  }
  return (data ?? []).map(l => ({ id: l.id as string, name: l.name as string, is_main: !!l.is_main }))
}

export async function getProduct(ctx: StoreContext, id: string): Promise<ProductRow | null> {
  const { data, error } = await getServerSupabase().from('products').select(PRODUCT_COLUMNS)
    .eq('id', id).eq('store_id', ctx.storeId).maybeSingle()
  if (error) throw error
  return data as ProductRow | null
}

const PRODUCT_SCHEMA: Schema = {
  name:        { type: 'text', max: PRODUCT_MAX.name, required: true, label: 'El nombre' },
  kind:        { type: 'enum', values: ['product', 'service'], label: 'El tipo' },
  sku:         { type: 'text', max: PRODUCT_MAX.sku, nullable: true, label: 'El SKU' },
  barcode:     { type: 'text', max: PRODUCT_MAX.barcode, nullable: true, label: 'El código de barras' },
  category:    { type: 'text', max: PRODUCT_MAX.category, nullable: true, label: 'La categoría' },
  brand:       { type: 'text', max: PRODUCT_MAX.brand, nullable: true, label: 'La marca' },
  unit:        { type: 'text', max: PRODUCT_MAX.unit, nullable: true, label: 'La unidad' },
  description: { type: 'text', max: PRODUCT_MAX.description, nullable: true, label: 'La descripción' },
  cost:        { type: 'number', min: 0, max: MAX_PRICE, nullable: true, label: 'El costo' },
  tax_rate:    { type: 'number', min: 0, max: 16, label: 'El IVA' },
  stock:       { type: 'number', min: -99_999_999_999, max: 99_999_999_999, nullable: true, label: 'Las existencias' },
}

export type ProductInput = Partial<Pick<ProductRow, 'name' | 'kind' | 'sku' | 'barcode' | 'category' | 'brand' | 'unit' | 'description'>>
  & { cost?: number | null; tax_rate?: number; stock?: number | null; prices?: Record<string, number> }

/**
 * Campos del formulario, validados. Los precios solo de listas de la tienda
 * (`listIds`) y con 2 decimales; uno vacío se quita. Crear exige el nombre.
 */
export function parseProductInput(body: Record<string, unknown>, listIds: Set<string>, { partial }: { partial: boolean }):
  { ok: true; data: ProductInput } | { ok: false; error: string } {
  const parsed = parseFields(body, PRODUCT_SCHEMA, { partial })
  if (!parsed.ok) return parsed
  const data = parsed.data as ProductInput
  if (data.tax_rate !== undefined && ![0, 8, 16].includes(data.tax_rate)) return { ok: false, error: 'El IVA es 16 %, 8 % o exento' }
  if (data.kind === 'service') data.stock = null
  if (data.stock !== undefined && data.stock !== null) data.stock = Math.round(data.stock * 1000) / 1000
  if (data.cost !== undefined && data.cost !== null) data.cost = Math.round(data.cost * 100) / 100
  if (Object.hasOwn(body, 'prices')) {
    const raw = body.prices
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Precios inválidos' }
    const prices: Record<string, number> = {}
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!listIds.has(id)) return { ok: false, error: 'Una lista de precios ya no existe. Vuelve a abrir el producto.' }
      if (v === null || v === undefined || v === '') continue
      const n = typeof v === 'number' ? v : Number(v)
      if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE) return { ok: false, error: 'Revisa los precios: deben ser números de 0 en adelante' }
      prices[id] = Math.round(n * 100) / 100
    }
    data.prices = prices
  }
  return { ok: true, data }
}

/** Quién puede cambiar productos y listas: administradores de una tienda que no está en solo lectura. */
export const PRODUCT_WRITE = { write: true, admin: true } as const
