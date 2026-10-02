import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, serverError } from '@/lib/validation'

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
