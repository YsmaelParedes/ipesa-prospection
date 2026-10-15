import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { EMAIL_RE, createInvitation } from '@/lib/invitations'
import { logPlatformEvent } from '@/lib/platformEvents'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

/**
 * POST /api/platform/stores/[id]/invitation { email } — genera un enlace nuevo
 * de invitación para el dueño (venció, se perdió o cambió el correo). Revoca
 * las invitaciones de dueño anteriores. Solo si la tienda aún no tiene dueño.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  const body = await readJson(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe el correo del dueño')

  const db = getServerSupabase()
  const [{ data: store }, { data: owners }] = await Promise.all([
    db.from('stores').select('id').eq('id', id).maybeSingle(),
    db.from('store_members').select('user_id').eq('store_id', id).eq('role', 'owner').eq('status', 'active').limit(1),
  ])
  if (!store) return jsonError('Tienda no encontrada', 404)
  if (owners?.length) return jsonError('Esta tienda ya tiene dueño; él invita a su equipo desde Configuración.', 409)

  try {
    const { invitation, link } = await createInvitation({
      storeId: id, email, role: 'owner', invitedBy: user.id, origin: req.nextUrl.origin, replaceRole: true,
    })
    await logPlatformEvent(id, user.id, 'owner_invitation', { owner_email: email })
    return NextResponse.json({ invitation: { email, expiresAt: invitation.expires_at }, link }, { status: 201 })
  } catch (error) {
    return serverError('POST /api/platform/stores/[id]/invitation', error, 'No se pudo crear la invitación')
  }
}
