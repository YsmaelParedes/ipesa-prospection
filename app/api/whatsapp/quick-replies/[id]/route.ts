import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireAdmin } from '@/lib/supabase-server'
import { isUUID, jsonError, serverError } from '@/lib/validation'

// DELETE /api/whatsapp/quick-replies/[id] (solo admin)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('No encontrado', 404)

  const { error } = await getServerSupabase().from('whatsapp_quick_replies').delete().eq('id', id)
  if (error) return serverError('DELETE /api/whatsapp/quick-replies/[id]', error, 'Error al eliminar')
  return NextResponse.json({ success: true })
}
