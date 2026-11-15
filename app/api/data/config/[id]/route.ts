import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'

/**
 * PATCH /api/data/config/[id] { label } — solo administradores. Cambia el
 * nombre de la opción y el de los contactos que la tienen, en una sola
 * transacción (función rename_catalog_item). Devuelve { label, contacts }.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('No encontrado', 404)
  const body = await readJson(req)
  if (typeof body?.label !== 'string') return jsonError('Escribe el nombre nuevo')

  const { data, error } = await getServerSupabase().rpc('rename_catalog_item', { p_store: ctx.storeId, p_id: id, p_label: body.label })
  const known = rpcUserError(error)
  if (known) return jsonError(known.message, known.status)
  if (error) return serverError('PATCH /api/data/config/[id]', error, 'No se pudo cambiar el nombre')
  return NextResponse.json(data)
}

// DELETE /api/data/config/[id] — solo administradores
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('No encontrado', 404)

  const { error } = await getServerSupabase().from('app_config').delete().eq('id', id).eq('store_id', ctx.storeId)
  if (error) return serverError('DELETE /api/data/config/[id]', error, 'Error al eliminar')
  return NextResponse.json({ success: true })
}
