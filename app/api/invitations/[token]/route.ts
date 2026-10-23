import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthClient, getServerSupabase, getSessionUser, invalidateStoreMembers,
} from '@/lib/supabase-server'
import { setActiveStoreCookie, storeLogoUrl } from '@/lib/storeServer'
import { findInvitationByToken, invitationStatus, maskEmail, passwordProblem, siteOrigin } from '@/lib/invitations'
import { PLANS } from '@/lib/stores'
import { jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'

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

  const [store, sessionUser, existing] = await Promise.all([
    storeInfo(inv.store_id),
    getSessionUser(),
    getServerSupabase().rpc('auth_user_id_by_email', { p_email: inv.email }),
  ])
  if (!store) return jsonError('Esta invitación no existe', 404)
  return NextResponse.json({
    store,
    role: inv.role,
    email: maskEmail(inv.email),
    status: invitationStatus(inv),
    accountExists: !!existing.data,
    signedInAs: sessionUser ? { email: sessionUser.email, matches: sessionUser.email?.toLowerCase() === inv.email } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /api/invitations/[token] — aceptar.
 *  · Con sesión: la cuenta debe ser la del correo invitado.
 *  · Sin sesión y sin cuenta: { name, password } crea la cuenta SIN
 *    confirmar y Supabase manda el correo de confirmación; al abrirlo vuelve
 *    a esta invitación ya con sesión y la acepta. Así solo entra quien de
 *    verdad controla ese correo (el enlace pudo reenviarse por WhatsApp).
 *  · Sin sesión y con cuenta: pide iniciar sesión primero (LOGIN_REQUIRED).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { token } = await params
  const inv = await findInvitationByToken(token)
  if (!inv) return jsonError('Esta invitación no existe', 404)
  const status = invitationStatus(inv)
  if (status !== 'valid') {
    const msg = { expired: 'La invitación venció. Pide una nueva.', used: 'Esta invitación ya se usó.', revoked: 'La invitación fue cancelada.' }[status]
    return jsonError(msg, 410)
  }

  const db = getServerSupabase()
  let userId: string
  const sessionUser = await getSessionUser()
  const body = (await readJson(req)) ?? {}

  try {
    if (sessionUser) {
      if (sessionUser.email?.toLowerCase() !== inv.email) {
        return NextResponse.json({ error: `Esta invitación es para ${maskEmail(inv.email)}. Cierra sesión y entra con esa cuenta.`, code: 'EMAIL_MISMATCH' }, { status: 403 })
      }
      userId = sessionUser.id
    } else {
      const { data: existingId } = await db.rpc('auth_user_id_by_email', { p_email: inv.email })
      if (existingId) {
        return NextResponse.json({ error: 'Ya tienes una cuenta: inicia sesión para aceptar.', code: 'LOGIN_REQUIRED' }, { status: 409 })
      }
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (name.length < 2 || name.length > 60) return jsonError('Escribe tu nombre')
      const problem = passwordProblem(body.password)
      if (problem) return jsonError(problem)

      const auth = await getAuthClient()
      const { data: signUp, error: signUpError } = await auth.auth.signUp({
        email: inv.email,
        password: body.password as string,
        options: {
          data: { display_name: name },
          emailRedirectTo: `${siteOrigin(req.nextUrl.origin)}/auth/confirm?next=${encodeURIComponent(`/invitacion/${token}`)}`,
        },
      })
      if (signUpError) {
        const msg = signUpError.message.toLowerCase()
        if (msg.includes('rate limit') || signUpError.status === 429) return jsonError('Se enviaron demasiados correos. Espera unos minutos e intenta de nuevo.', 429)
        if (msg.includes('password')) return jsonError('Esa contraseña no cumple los requisitos de seguridad. Prueba con otra.')
        throw signUpError
      }
      // Con la confirmación de correo activa (lo normal) aún no hay sesión
      if (!signUp.session || !signUp.user) return NextResponse.json({ ok: true, needsConfirmation: true })
      userId = signUp.user.id
    }

    // Todo o nada, con la tienda bloqueada: revisa el plan vigente (lugares,
    // administradores), marca la invitación y crea la membresía
    const { error: acceptError } = await db.rpc('accept_store_invitation', { p_invitation: inv.id, p_user: userId, p_plans: PLANS })
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
