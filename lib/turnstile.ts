/**
 * Cloudflare Turnstile (captcha casi invisible) en las pantallas públicas de
 * acceso: registro, inicio de sesión y recuperar contraseña.
 *
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  llave pública del widget (va en la página)
 *   TURNSTILE_SECRET_KEY            llave secreta (solo servidor)
 *
 * Si falta cualquiera de las dos, la verificación se omite (desarrollo local o
 * mientras se configura): así nunca se exige un token que la página no pidió.
 * En producción deben estar las dos.
 */
import { clientIp } from './rateLimit'

export type TurnstileAction = 'login' | 'register' | 'recover'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const turnstileEnabled = () => !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

/** Mensaje para el usuario cuando falta o no pasa la verificación. */
export const TURNSTILE_ERROR = 'No pudimos verificar que eres una persona. Espera a que termine la verificación e intenta de nuevo.'

/**
 * Comprueba con Cloudflare el token que mandó el navegador. Cada token sirve
 * una sola vez y caduca en 5 minutos. Devuelve true si pasa (o si Turnstile
 * no está configurado).
 */
export async function verifyTurnstile(token: unknown, req: Request, action: TurnstileAction): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret || !turnstileEnabled()) return true
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  try {
    const form = new URLSearchParams({ secret, response: token })
    const ip = clientIp(req)
    if (ip && ip !== 'unknown') form.set('remoteip', ip)
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })
    const data = await res.json() as { success?: boolean; action?: string; 'error-codes'?: string[] }
    if (!data.success) return false
    // El widget declara para qué pantalla se resolvió: un token de otra no sirve
    return !data.action || data.action === action
  } catch (error) {
    console.error('[turnstile] no se pudo verificar:', error instanceof Error ? error.message : error)
    return false
  }
}
