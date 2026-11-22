import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'
import { IMPORT_CHUNK, MAX_PRICE_LISTS, PRODUCT_MAX } from '@/lib/products'
import { PRODUCT_WRITE } from '@/lib/productsServer'

type ImportResult = { created: number; updated: number; overLimit: number; invalid: number; limit: number | null }

/**
 * POST /api/data/products/import — un lote del archivo (administrador).
 * { lists: ["Público", "Aplazo"…], items: [{ name, key, sku…, prices: [precio por lista] }] }
 * Las listas que no existen se crean; cada producto se reconoce por su clave
 * o su SKU y lo que llega vacío no borra nada (import_products en la base).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const lists = body.lists
  const items = body.items
  if (!Array.isArray(lists) || lists.length > MAX_PRICE_LISTS
      || !lists.every(l => typeof l === 'string' && l.trim() && l.trim().length <= PRODUCT_MAX.listName)) {
    return jsonError(`Revisa las listas de precios: cada una con nombre, hasta ${MAX_PRICE_LISTS}`)
  }
  if (!Array.isArray(items) || !items.length || items.length > IMPORT_CHUNK) return jsonError('No hay productos para importar')

  try {
    const db = getServerSupabase()
    let ids: string[] = []
    if (lists.length) {
      const made = await db.rpc('ensure_price_lists', { p_store: ctx.storeId, p_names: lists.map(l => (l as string).trim()) })
      if (made.error) {
        const known = rpcUserError(made.error)
        if (known) return jsonError(known.message, known.status)
        throw made.error
      }
      ids = made.data as string[]
    }
    // Los precios llegan en el orden de las listas: aquí pasan a { id de lista: precio }
    const payload = items.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      const { prices, ...rest } = raw as Record<string, unknown>
      const byList: Record<string, number> = {}
      if (Array.isArray(prices)) prices.forEach((p, i) => { if (typeof p === 'number' && ids[i]) byList[ids[i]] = p })
      return { ...rest, prices: byList }
    })
    const { data, error } = await db.rpc('import_products', { p_store: ctx.storeId, p_items: payload })
    if (error) {
      const known = rpcUserError(error)
      if (known) return jsonError(known.message, known.status)
      throw error
    }
    return NextResponse.json(data as ImportResult)
  } catch (error) {
    return serverError('POST /api/data/products/import', error, 'No se pudieron importar los productos')
  }
}
