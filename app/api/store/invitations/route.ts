import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { hashToken, randomToken } from '@/lib/crypto'
import { EMAIL_RE, INVITATION_DAYS, invitationStatus, siteOrigin, type InvitationRow } from '@/lib/invitations'
import { planOf } from '@/lib/stores'
import { jsonError, readJson, serverError } from '@/lib/validation'

const COLUMNS = 'id, store_id, email, role, expires_at, accepted_at, revoked_at, created_at'

async function pendingInvitations(storeId: string): Promise<InvitationRow[]> {
  const { data, error } = await getServerSupabase().from('store_invitations').select(COLUMNS)
    .eq('store_id', storeId).is('accepted_at', null).is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as InvitationRow[]
}

// GET /api/store/invitations — pendientes (dueño/admin)
export async function GET() {
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
  if (role === 'admin' && !ctx.isOwner) return jsonError('Solo el dueño puede invitar administradores', 403)

  try {
    const [members, pending] = await Promise.all([getStoreMembers(ctx.storeId), pendingInvitations(ctx.storeId)])
    if (members.some(m => m.email.toLowerCase() === email)) return jsonError('Esa persona ya es parte del equipo')
    const activeSeats = members.filter(m => m.status === 'active').length
      + pending.filter(i => invitationStatus(i) === 'valid' && i.email !== email).length
    const { maxUsers, label } = planOf(ctx.store.plan)
    if (activeSeats >= maxUsers) return jsonError(`Tu plan ${label} permite hasta ${maxUsers} usuarios`, 403)

    // Un administrador no puede pisar (ni rebajar) la invitación de administrador que hizo el dueño
    if (!ctx.isOwner && pending.some(i => i.email === email && i.role === 'admin' && invitationStatus(i) === 'valid')) {
      return jsonError('Ese correo ya tiene una invitación de administrador; solo el dueño puede cambiarla.', 403)
    }

    const db = getServerSupabase()
    // Una sola invitación vigente por correo: las anteriores se revocan
    await db.from('store_invitations').update({ revoked_at: new Date().toISOString() })
      .eq('store_id', ctx.storeId).eq('email', email).is('accepted_at', null).is('revoked_at', null)

    const token = randomToken(32)
    const { data, error } = await db.from('store_invitations').insert({
      store_id: ctx.storeId,
      email,
      role,
      token_hash: hashToken(token),
      invited_by: ctx.uid,
      expires_at: new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    }).select(COLUMNS).single()
    if (error) throw error

    const link = `${siteOrigin(req.nextUrl.origin)}/invitacion/${token}`
    return NextResponse.json({
      invitation: { id: data.id, email, role, expiresAt: data.expires_at, status: 'valid' },
      link,
    }, { status: 201 })
  } catch (error) {
    return serverError('POST /api/store/invitations', error, 'No se pudo crear la invitación')
  }
}
