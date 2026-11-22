import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, rpcUserError, serverError } from '@/lib/validation'
import { PRODUCT_WRITE } from '@/lib/productsServer'

type Ctx = { params: Promise<{ id: string }> }

/**
 * DELETE /api/data/products/lists/[id] — borra una lista (administrador): sus
 * precios salen de todos los productos y las cotizaciones que la usaban
 * quedan sin lista. La principal no se puede borrar.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore(PRODUCT_WRITE)
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Lista de precios no encontrada', 404)
  try {
    const { error } = await getServerSupabase().rpc('delete_price_list', { p_store: ctx.storeId, p_list: id })
    if (error) {
      const known = rpcUserError(error)
      if (known) return jsonError(known.message, known.status)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('DELETE /api/data/products/lists/[id]', error, 'No se pudo borrar la lista de precios')
  }
}
