import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { parsePlanLimitError, planLimitResponse } from '@/lib/planLimits'
import { PRODUCT_ORDERS, PRODUCT_PAGE } from '@/lib/products'
import {
  PRODUCT_COLUMNS, PRODUCT_WRITE, getPriceLists, parseProductInput, productToClient, type ProductRow,
} from '@/lib/productsServer'

const ORDERS = PRODUCT_ORDERS.map(o => o.value) as string[]

/**
 * GET /api/data/products[?q=&category=&brand=&order=&page=]
 * Una página de productos (50) con el total y las listas de precios. Cada
 * palabra de la búsqueda tiene que aparecer en el nombre, SKU, código, marca,
 * categoría o unidad. Todo el equipo; el costo solo a los administradores.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const sp = req.nextUrl.searchParams
  const order = sp.get('order') ?? 'name'
  if (!ORDERS.includes(order)) return jsonError('Orden inválido')
  const page = Number(sp.get('page') ?? 0)
  if (!Number.isInteger(page) || page < 0 || page > 10_000) return jsonError('Página inválida')

  try {
    const [search, lists] = await Promise.all([
      getServerSupabase().rpc('search_products', {
        p_store: ctx.storeId,
        p_query: (sp.get('q') ?? '').trim().slice(0, 120),
        p_category: (sp.get('category') ?? '').slice(0, 100) || null,
        p_brand: (sp.get('brand') ?? '').slice(0, 100) || null,
        p_order: order,
        p_limit: PRODUCT_PAGE,
        p_offset: page * PRODUCT_PAGE,
      }),
      getPriceLists(ctx.storeId),
    ])
    if (search.error) throw search.error
    const result = search.data as { total: number; rows: ProductRow[] }
    return NextResponse.json({
      products: (result.rows ?? []).map(r => productToClient(r, ctx.isAdmin)),
      total: Number(result.total) || 0,
      page,
      pageSize: PRODUCT_PAGE,
      lists,
    })
  } catch (error) {
    return serverError('GET /api/data/products', error, 'No se pudieron cargar los productos')
  }
}

/** POST /api/data/products — agrega un producto (administrador). En Litro, hasta 200. */
export async function POST(req: NextRequest) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  try {
    const lists = await getPriceLists(ctx.storeId)
    const parsed = parseProductInput(body, new Set(lists.map(l => l.id)), { partial: false })
    if (!parsed.ok) return jsonError(parsed.error)
    const { data, error } = await getServerSupabase().from('products')
      .insert([{ kind: 'product', tax_rate: 16, prices: {}, ...parsed.data, store_id: ctx.storeId }])
      .select(PRODUCT_COLUMNS).single()
    if (error) {
      const limit = parsePlanLimitError(error)
      if (limit) return planLimitResponse(limit.kind, limit.limit)
      throw error
    }
    return NextResponse.json({ product: productToClient(data as unknown as ProductRow, true) })
  } catch (error) {
    return serverError('POST /api/data/products', error, 'No se pudo guardar el producto')
  }
}

/**
 * DELETE /api/data/products — borra los productos elegidos (administrador,
 * hasta 500 por vez). Las cotizaciones que los usaron no cambian: guardan su
 * propia copia de la descripción y el precio.
 */
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(isUUID)) return jsonError('Productos inválidos')
  try {
    const { error, count } = await getServerSupabase().from('products').delete({ count: 'exact' })
      .eq('store_id', ctx.storeId).in('id', ids)
    if (error) throw error
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (error) {
    return serverError('DELETE /api/data/products', error, 'No se pudieron borrar los productos')
  }
}
