import { NextRequest, NextResponse } from 'next/server'
import {
  getServerSupabase, getStoreMembers, invalidateStoreMembers, requireStore, type StoreContext,
} from '@/lib/supabase-server'
import type { StoreRole } from '@/lib/stores'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

/**
 * Equipo de la tienda.
 *  · El dueño administra a todos (menos a sí mismo).
 *  · Un administrador solo administra vendedores.
 */
function canManage(ctx: StoreContext, targetRole: StoreRole) {
  if (targetRole === 'owner') return false
  if (ctx.isOwner) return true
  return ctx.isAdmin && targetRole === 'employee'
}

/** Las invitaciones pendientes que emitió alguien dejan de valer cuando pierde el acceso o el rol. */
async function revokeInvitationsFrom(storeId: string, userId: string) {
  const { error } = await getServerSupabase().from('store_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('store_id', storeId).eq('invited_by', userId).is('accepted_at', null).is('revoked_at', null)
  if (error) console.error('[store/members] revocar invitaciones', error.message)
}

// GET /api/store/members — dueño/admin
export async function GET() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  try {
    const members = await getStoreMembers(ctx.storeId)
    return NextResponse.json({
      members: members.map(m => ({ ...m, isMe: m.user_id === ctx.uid, canManage: m.user_id !== ctx.uid && canManage(ctx, m.role) })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serverError('GET /api/store/members', error, 'No se pudo cargar el equipo')
  }
}

async function targetMember(ctx: StoreContext, userId: unknown) {
  if (!isUUID(userId)) return null
  const { data } = await getServerSupabase().from('store_members').select('user_id, role, status')
    .eq('store_id', ctx.storeId).eq('user_id', userId).maybeSingle()
  return data as { user_id: string; role: StoreRole; status: string } | null
}

// PATCH /api/store/members { userId, role?, status? }
export async function PATCH(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const target = await targetMember(ctx, body.userId)
  if (!target) return jsonError('Usuario no encontrado', 404)
  if (target.user_id === ctx.uid) return jsonError('No puedes cambiar tu propio acceso')
  if (!canManage(ctx, target.role)) return jsonError('No tienes permiso para cambiar a este usuario', 403)

  const updates: Record<string, unknown> = {}
  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'employee') return jsonError('Rol inválido')
    if (body.role === 'admin' && !ctx.isOwner) return jsonError('Solo el dueño puede nombrar administradores', 403)
    updates.role = body.role
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') return jsonError('Estado inválido')
    updates.status = body.status
  }
  if (!Object.keys(updates).length) return jsonError('Nada que actualizar')

  const { error } = await getServerSupabase().from('store_members').update(updates)
    .eq('store_id', ctx.storeId).eq('user_id', target.user_id)
  if (error) return serverError('PATCH /api/store/members', error, 'No se pudo actualizar el usuario')
  if (updates.status === 'disabled' || (target.role === 'admin' && updates.role === 'employee')) {
    await revokeInvitationsFrom(ctx.storeId, target.user_id)
  }
  invalidateStoreMembers(ctx.storeId)
  return NextResponse.json({ ok: true })
}

// DELETE /api/store/members { userId } — lo quita de esta tienda (su cuenta sigue existiendo)
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  const target = await targetMember(ctx, body?.userId)
  if (!target) return jsonError('Usuario no encontrado', 404)
  if (target.user_id === ctx.uid) return jsonError('No puedes quitarte a ti mismo')
  if (!canManage(ctx, target.role)) return jsonError('No tienes permiso para quitar a este usuario', 403)

  const { error } = await getServerSupabase().from('store_members').delete()
    .eq('store_id', ctx.storeId).eq('user_id', target.user_id)
  if (error) return serverError('DELETE /api/store/members', error, 'No se pudo quitar al usuario')
  await revokeInvitationsFrom(ctx.storeId, target.user_id)
  invalidateStoreMembers(ctx.storeId)
  return NextResponse.json({ ok: true })
}
