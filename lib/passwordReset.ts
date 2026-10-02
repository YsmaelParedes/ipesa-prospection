/**
 * Permiso temporal para cambiar la contraseña sin escribir la actual: solo
 * se otorga al abrir un enlace de recuperación válido (/auth/confirm) y queda
 * ligado a ese usuario por 15 minutos en una cookie firmada (HMAC). Así una
 * sesión robada o abierta en otra computadora no basta para cambiarla.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE = 'crm_pw_reset'
const TTL_SECONDS = 15 * 60

function sign(payload: string): string {
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('Falta SUPABASE_SERVICE_KEY')
  return createHmac('sha256', key).update(`password-reset:${payload}`).digest('base64url')
}

export async function grantPasswordReset(userId: string) {
  const payload = `${userId}.${Math.floor(Date.now() / 1000) + TTL_SECONDS}`
  ;(await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

export async function hasPasswordReset(userId: string): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value
  const [uid, exp, sig] = raw?.split('.') ?? []
  if (!uid || !exp || !sig || uid !== userId || Number(exp) * 1000 < Date.now()) return false
  const expected = Buffer.from(sign(`${uid}.${exp}`))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export async function clearPasswordReset() {
  ;(await cookies()).delete(COOKIE)
}
