import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, serverError } from '@/lib/validation'

// DELETE /api/store/invitations/[id] — revoca una invitación pendiente (dueño; admin solo las de vendedor)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Invitación no encontrada', 404)
  let q = getServerSupabase().from('store_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id).eq('store_id', ctx.storeId).is('accepted_at', null).is('revoked_at', null)
  // Las invitaciones de administrador solo las cancela el dueño
  if (!ctx.isOwner) q = q.eq('role', 'employee')
  const { data, error } = await q.select('id')
  if (error) return serverError('DELETE /api/store/invitations/[id]', error, 'No se pudo revocar la invitación')
  if (!data?.length) return jsonError('Invitación no encontrada', 404)
  return NextResponse.json({ ok: true })
}
