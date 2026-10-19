import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { EMAIL_RE, INVITATION_COLUMNS as COLUMNS, createInvitation, invitationStatus, type InvitationRow } from '@/lib/invitations'
import { planOf } from '@/lib/stores'
import { jsonError, readJson, serverError } from '@/lib/validation'

async function pendingInvitations(storeId: string): Promise<InvitationRow[]> {
  const { data, error } = await getServerSupabase().from('store_invitations').select(COLUMNS)
    .eq('store_id', storeId).is('accepted_at', null).is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InvitationRow[]
}

// GET /api/store/invitations — pendientes (dueño/admin)
async function GETImpl() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  try {
    const list = await pendingInvitations(ctx.storeId)
    return NextResponse.json({
      invitations: list.map(i => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at, status: invitationStatus(i) })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serverError('GET /api/store/invitations', error, 'No se pudieron cargar las invitaciones')
  }
}

/**
 * POST /api/store/invitations { email, role } — genera el enlace de
 * invitación (se comparte por WhatsApp o correo). El token solo se devuelve
 * esta vez; en la base queda su hash.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body?.role === 'admin' ? 'admin' : 'employee'
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe un correo válido')
  if (role === 'admin' && !planOf(ctx.plan).allowAdmins) {
    return jsonError('Tu plan no incluye administradores además del dueño (Cubeta sí). Invita a tu equipo como vendedores.', 403)
  }
  if (role === 'admin' && !ctx.isOwner) return jsonError('Solo el dueño puede invitar administradores', 403)

  try {
    const [members, pending] = await Promise.all([getStoreMembers(ctx.storeId), pendingInvitations(ctx.storeId)])
    if (members.some(m => m.email.toLowerCase() === email)) return jsonError('Esa persona ya es parte del equipo')
    const activeSeats = members.filter(m => m.status === 'active').length
      + pending.filter(i => invitationStatus(i) === 'valid' && i.email !== email).length
    const { maxUsers, label } = planOf(ctx.plan)
    if (activeSeats >= maxUsers) {
      return jsonError(maxUsers === 1
        ? `El plan ${label} incluye solo al dueño. Cambia a Galón o Cubeta para invitar a tu equipo.`
        : `Tu plan ${label} permite hasta ${maxUsers} usuarios. Cambia de plan para sumar más.`, 403)
    }

    // Un administrador no puede pisar (ni rebajar) la invitación de administrador que hizo el dueño
    if (!ctx.isOwner && pending.some(i => i.email === email && i.role === 'admin' && invitationStatus(i) === 'valid')) {
      return jsonError('Ese correo ya tiene una invitación de administrador; solo el dueño puede cambiarla.', 403)
    }

    // Una sola invitación vigente por correo: las anteriores se revocan
    const { invitation: data, link } = await createInvitation({ storeId: ctx.storeId, email, role, invitedBy: ctx.uid, origin: req.nextUrl.origin })
    return NextResponse.json({
      invitation: { id: data.id, email, role, expiresAt: data.expires_at, status: 'valid' },
      link,
    }, { status: 201 })
  } catch (error) {
    return serverError('POST /api/store/invitations', error, 'No se pudo crear la invitación')
  }
}

export const GET = withServerTiming(GETImpl)
