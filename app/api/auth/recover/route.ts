import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { EMAIL_RE, siteOrigin } from '@/lib/invitations'
import { clientIp, DAY, hashKey, HOUR, limitShared, tooMany } from '@/lib/rateLimit'
import { jsonError, readJson } from '@/lib/validation'
import { reportError } from '@/lib/errorReport'
import { TURNSTILE_ERROR, verifyTurnstile } from '@/lib/turnstile'

// POST /api/auth/recover { email } — envía el enlace para restablecer la contraseña
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe un correo válido')
  const ip = clientIp(req)
  if (!(await limitShared([
    { key: `recover:ip:${ip}`, max: 5, windowMs: HOUR },
    { key: `recover:ipday:${ip}`, max: 15, windowMs: DAY },
    { key: `recover:acct:${hashKey(email)}`, max: 3, windowMs: HOUR },
  ]))) return tooMany('Ya enviamos varios enlaces. Revisa tu correo o intenta en una hora.', 60 * 60)
  if (!(await verifyTurnstile(body?.captcha, req, 'recover'))) return jsonError(TURNSTILE_ERROR, 403)

  const supabase = await getAuthClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin(req.nextUrl.origin)}/auth/confirm?next=/restablecer`,
  })
  if (error) {
    console.error('[POST /api/auth/recover]', error.message)
    // Un límite de correos no es una falla; el envío de correo que no funciona, sí
    if (!/rate limit/i.test(error.message) && error.status !== 429) reportError({ source: 'server', context: 'POST /api/auth/recover', error })
  }
  // Misma respuesta exista o no la cuenta (no revelar qué correos están registrados)
  return NextResponse.json({ ok: true })
}
