import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthClient, getServerSupabase, getSessionUser, unauthorizedResponse } from '@/lib/supabase-server'
import { passwordProblem } from '@/lib/invitations'
import { clearPasswordReset, hasPasswordReset } from '@/lib/passwordReset'
import { rateLimit } from '@/lib/rateLimit'
import { jsonError, readJson } from '@/lib/validation'

/** Comprueba la contraseña actual con un cliente aparte (no toca las cookies de la sesión). */
async function currentPasswordIsValid(email: string, password: string): Promise<boolean> {
  const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await verifier.auth.signInWithPassword({ email, password })
  if (error) return false
  await verifier.auth.signOut({ scope: 'local' }).catch(() => {})  // cierra esa sesión de verificación
  return true
}

/**
 * POST /api/auth/password { password, currentPassword? } — nueva contraseña.
 *  · Desde un enlace de recuperación reciente (/restablecer): basta la nueva.
 *  · Desde la app (Mi cuenta): hay que escribir la actual.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user?.email) return unauthorizedResponse()
  if (!rateLimit(`password:${user.id}`, 6, 15 * 60 * 1000)) {
    return jsonError('Demasiados intentos. Espera unos minutos.', 429)
  }

  const body = await readJson(req)
  const problem = passwordProblem(body?.password)
  if (problem) return jsonError(problem)
  const password = body!.password as string

  const fromRecovery = await hasPasswordReset(user.id)
  if (!fromRecovery) {
    const current = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    // Sin contraseña actual: el enlace de recuperación ya no sirve (o nunca hubo)
    if (!current) return jsonError('El enlace para restablecer venció. Solicita uno nuevo.', 401)
    if (!(await currentPasswordIsValid(user.email, current))) return jsonError('Tu contraseña actual no es correcta')
    if (current === password) return jsonError('La nueva contraseña debe ser distinta a la actual')
  }

  const { error } = await getServerSupabase().auth.admin.updateUserById(user.id, { password })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('different from the old')) return jsonError('La nueva contraseña debe ser distinta a la anterior')
    if (msg.includes('weak') || msg.includes('pwned') || msg.includes('password')) return jsonError('Esa contraseña no cumple los requisitos de seguridad. Prueba con otra.')
    console.error('[POST /api/auth/password]', error.message)
    return jsonError('No se pudo cambiar la contraseña', 500)
  }
  if (fromRecovery) await clearPasswordReset()
  // Cierra la sesión en los demás dispositivos; esta sigue activa
  await (await getAuthClient()).auth.signOut({ scope: 'others' }).catch(() => {})
  return NextResponse.json({ ok: true })
}
