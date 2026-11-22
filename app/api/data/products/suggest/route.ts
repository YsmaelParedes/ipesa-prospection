import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, serverError } from '@/lib/validation'
import { mainListOf, netPrice, priceIn } from '@/lib/products'
import { PRODUCT_COLUMNS, getPriceLists, productToClient, type ProductRow } from '@/lib/productsServer'

/**
 * GET /api/data/products/suggest?q=…&list=… — productos para un renglón de
 * cotización, con su precio en esa lista (con y sin IVA). Si no tiene precio
 * en esa lista se da el de la principal y `fallback` lo dice.
 * GET /api/data/products/suggest?ids=a,b&list=… — lo mismo para productos ya
 * elegidos (al cambiar la lista de la cotización).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 120)
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean)
  if (ids.length > 100 || !ids.every(isUUID)) return jsonError('Productos inválidos')
  const listParam = sp.get('list')
  if (listParam && !isUUID(listParam)) return jsonError('Lista inválida')
  if (!q && !ids.length) return NextResponse.json({ products: [] })

  try {
    const db = getServerSupabase()
    const [lists, rows] = await Promise.all([
      getPriceLists(ctx.storeId),
      ids.length
        ? db.from('products').select(PRODUCT_COLUMNS).eq('store_id', ctx.storeId).in('id', ids)
            .then(({ data, error }) => { if (error) throw error; return (data ?? []) as unknown as ProductRow[] })
        : db.rpc('search_products', { p_store: ctx.storeId, p_query: q, p_category: null, p_brand: null, p_order: 'name', p_limit: 6, p_offset: 0 })
            .then(({ data, error }) => { if (error) throw error; return ((data as { rows: ProductRow[] }).rows ?? []) }),
    ])
    const main = mainListOf(lists)
    const list = lists.find(l => l.id === listParam) ?? main
    return NextResponse.json({
      products: rows.map(r => {
        const p = productToClient(r, false)
        const { price, fallback } = priceIn(p, list?.id, main?.id)
        return {
          id: p.id, name: p.name, unit: p.unit, sku: p.sku, kind: p.kind, stock: p.stock, tax_rate: p.tax_rate,
          price, net: price === null ? null : netPrice(price, p.tax_rate), fallback,
        }
      }),
      list: list ? { id: list.id, name: list.name } : null,
      main: main ? { id: main.id, name: main.name } : null,
    })
  } catch (error) {
    return serverError('GET /api/data/products/suggest', error, 'No se pudieron buscar los productos')
  }
}
