import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getSessionUser, invalidateStoreMembers } from '@/lib/supabase-server'
import { setActiveStoreCookie, storeLogoUrl } from '@/lib/storeServer'
import { findInvitationByToken, invitationStatus, maskEmail } from '@/lib/invitations'
import { PLANS } from '@/lib/stores'
import { jsonError, rpcUserError, serverError } from '@/lib/validation'

type Ctx = { params: Promise<{ token: string }> }

async function storeInfo(storeId: string) {
  const { data } = await getServerSupabase().from('stores').select('name, logo_path').eq('id', storeId).maybeSingle()
  return data ? { name: data.name as string, logoUrl: storeLogoUrl(data.logo_path) } : null
}

// GET /api/invitations/[token] — datos para mostrar la invitación (público)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const inv = await findInvitationByToken(token)
  if (!inv) return jsonError('Esta invitación no existe', 404)

  const [store, sessionUser] = await Promise.all([storeInfo(inv.store_id), getSessionUser()])
  if (!store) return jsonError('Esta invitación no existe', 404)
  return NextResponse.json({
    store,
    role: inv.role,
    email: maskEmail(inv.email),
    status: invitationStatus(inv),
    signedInAs: sessionUser ? { email: sessionUser.email, matches: sessionUser.email?.toLowerCase() === inv.email } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /api/invitations/[token] — aceptar. La invitación no crea cuentas:
 * hay que entrar con la cuenta del correo invitado (si no la tiene, la crea
 * en /registro y confirma su correo). Así la contraseña siempre la elige
 * quien controla ese correo, aunque el enlace se haya reenviado.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const inv = await findInvitationByToken(token)
  if (!inv) return jsonError('Esta invitación no existe', 404)
  const status = invitationStatus(inv)
  if (status !== 'valid') {
    const msg = { expired: 'La invitación venció. Pide una nueva.', used: 'Esta invitación ya se usó.', revoked: 'La invitación fue cancelada.' }[status]
    return jsonError(msg, 410)
  }

  const sessionUser = await getSessionUser()
  if (!sessionUser) {
    return NextResponse.json({ error: 'Inicia sesión con tu cuenta para aceptar la invitación.', code: 'LOGIN_REQUIRED' }, { status: 401 })
  }
  if (sessionUser.email?.toLowerCase() !== inv.email) {
    return NextResponse.json({ error: `Esta invitación es para ${maskEmail(inv.email)}. Cierra sesión y entra con esa cuenta.`, code: 'EMAIL_MISMATCH' }, { status: 403 })
  }

  try {
    // Todo o nada, con la tienda bloqueada: revisa el plan vigente (lugares,
    // administradores), marca la invitación y crea la membresía
    const { error: acceptError } = await getServerSupabase().rpc('accept_store_invitation', { p_invitation: inv.id, p_user: sessionUser.id, p_plans: PLANS })
    const known = rpcUserError(acceptError)
    if (known) return jsonError(known.message, known.status)
    if (acceptError) throw acceptError

    invalidateStoreMembers(inv.store_id)
    await setActiveStoreCookie(inv.store_id)
    return NextResponse.json({ ok: true, signedIn: true })
  } catch (error) {
    return serverError('POST /api/invitations/[token]', error, 'No se pudo aceptar la invitación')
  }
}
