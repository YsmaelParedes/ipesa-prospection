import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import {
  PRODUCT_COLUMNS, PRODUCT_WRITE, getPriceLists, getProduct, parseProductInput, productToClient, type ProductRow,
} from '@/lib/productsServer'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/data/products/[id] — la ficha: el producto y las listas de precios de la tienda. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Producto no encontrado', 404)
  try {
    const [row, lists] = await Promise.all([getProduct(ctx, id), getPriceLists(ctx.storeId)])
    if (!row) return jsonError('Producto no encontrado', 404)
    return NextResponse.json({ product: productToClient(row, ctx.isAdmin), lists })
  } catch (error) {
    return serverError('GET /api/data/products/[id]', error, 'No se pudo abrir el producto')
  }
}

/**
 * PATCH /api/data/products/[id] — guarda el formulario (administrador). Los
 * precios llegan completos: los de las listas que no vienen se quitan.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Producto no encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  try {
    const lists = await getPriceLists(ctx.storeId)
    const parsed = parseProductInput(body, new Set(lists.map(l => l.id)), { partial: true })
    if (!parsed.ok) return jsonError(parsed.error)
    const { data, error } = await getServerSupabase().from('products')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id).eq('store_id', ctx.storeId)
      .select(PRODUCT_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) return jsonError('Producto no encontrado', 404)
    return NextResponse.json({ product: productToClient(data as unknown as ProductRow, true) })
  } catch (error) {
    return serverError('PATCH /api/data/products/[id]', error, 'No se pudo guardar el producto')
  }
}

/** DELETE /api/data/products/[id] — lo borra (administrador). Las cotizaciones que lo usaron no cambian. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Producto no encontrado', 404)
  try {
    const { error, count } = await getServerSupabase().from('products').delete({ count: 'exact' })
      .eq('id', id).eq('store_id', ctx.storeId)
    if (error) throw error
    if (!count) return jsonError('Producto no encontrado', 404)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('DELETE /api/data/products/[id]', error, 'No se pudo borrar el producto')
  }
}
