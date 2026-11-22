import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'
import { MAX_PRICE_LISTS, PRODUCT_MAX, normText } from '@/lib/products'
import { PRODUCT_WRITE, getPriceLists } from '@/lib/productsServer'

async function listsWithCounts(storeId: string) {
  const [lists, counts] = await Promise.all([
    getPriceLists(storeId),
    getServerSupabase().rpc('price_list_counts', { p_store: storeId }),
  ])
  if (counts.error) throw counts.error
  const c = counts.data as { total: number; lists: Record<string, number> }
  return { lists: lists.map(l => ({ ...l, count: Number(c.lists?.[l.id] ?? 0) })), total: Number(c.total) || 0 }
}

/**
 * GET /api/data/products/lists — las listas de precios (la principal primero),
 * cuántos productos tienen precio en cada una y el total de productos.
 * Todo el equipo (la cotización elige su lista).
 */
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  try {
    return NextResponse.json(await listsWithCounts(ctx.storeId))
  } catch (error) {
    return serverError('GET /api/data/products/lists', error, 'No se pudieron cargar las listas de precios')
  }
}

/**
 * PUT /api/data/products/lists — guarda la ventana «Listas de precios»
 * (administrador): { lists: [{ id | null, name }], main: índice de la principal }.
 * Las que traen id cambian de nombre; las de id null se crean.
 */
export async function PUT(req: NextRequest) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  const raw = body?.lists
  const main = body?.main
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_PRICE_LISTS) return jsonError(`Una tienda tiene de 1 a ${MAX_PRICE_LISTS} listas de precios`)
  const lists = raw.map(l => {
    const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>
    return { id: isUUID(o.id) ? o.id : null, name: typeof o.name === 'string' ? o.name.trim() : '' }
  })
  if (lists.some(l => !l.name || l.name.length > PRODUCT_MAX.listName)) return jsonError('Cada lista necesita un nombre (hasta 80 letras)')
  if (new Set(lists.map(l => normText(l.name))).size !== lists.length) return jsonError('Hay dos listas con el mismo nombre')
  if (typeof main !== 'number' || !Number.isInteger(main) || main < 0 || main >= lists.length) return jsonError('Elige la lista principal')

  try {
    const db = getServerSupabase()
    const current = await getPriceLists(ctx.storeId)
    const known = new Set(current.map(l => l.id))
    if (lists.some(l => l.id && !known.has(l.id))) return jsonError('Una lista ya no existe. Vuelve a abrir la ventana.', 409)

    // Primero un nombre temporal a las que cambian: así dos listas pueden intercambiar nombres
    const renamed = lists.filter(l => l.id && current.find(c => c.id === l.id)?.name !== l.name)
    for (const l of renamed) {
      const { error } = await db.from('price_lists').update({ name: `~${l.id}` }).eq('id', l.id!).eq('store_id', ctx.storeId)
      if (error) throw error
    }
    for (const l of renamed) {
      const { error } = await db.from('price_lists').update({ name: l.name }).eq('id', l.id!).eq('store_id', ctx.storeId)
      if (error) {
        if (error.code === '23505') return jsonError(`Ya hay una lista que se llama «${l.name}»`, 409)
        throw error
      }
    }
    const fresh = lists.filter(l => !l.id)
    if (fresh.length) {
      const made = await db.rpc('ensure_price_lists', { p_store: ctx.storeId, p_names: fresh.map(l => l.name) })
      if (made.error) {
        const userError = rpcUserError(made.error)
        if (userError) return jsonError(userError.message, userError.status)
        throw made.error
      }
      ;(made.data as string[]).forEach((id, i) => { fresh[i].id = id })
    }
    const mainId = lists[main].id!
    const set = await db.rpc('set_main_price_list', { p_store: ctx.storeId, p_list: mainId })
    if (set.error) throw set.error
    return NextResponse.json(await listsWithCounts(ctx.storeId))
  } catch (error) {
    return serverError('PUT /api/data/products/lists', error, 'No se pudieron guardar las listas de precios')
  }
}
