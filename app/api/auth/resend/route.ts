import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { EMAIL_RE, siteOrigin } from '@/lib/invitations'
import { clientIp, DAY, hashKey, HOUR, limitShared, tooMany } from '@/lib/rateLimit'
import { jsonError, readJson } from '@/lib/validation'
import { reportError } from '@/lib/errorReport'

// POST /api/auth/resend { email } — reenvía el correo para confirmar la cuenta
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe un correo válido')
  const ip = clientIp(req)
  if (!(await limitShared([
    { key: `resend:ip:${ip}`, max: 5, windowMs: HOUR },
    { key: `resend:ipday:${ip}`, max: 15, windowMs: DAY },
    { key: `resend:acct:${hashKey(email)}`, max: 3, windowMs: HOUR },
  ]))) return tooMany('Ya reenviamos el correo varias veces. Revisa spam o intenta en una hora.', 60 * 60)

  const supabase = await getAuthClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${siteOrigin(req.nextUrl.origin)}/auth/confirm?next=/bienvenida` },
  })
  if (error) {
    console.error('[POST /api/auth/resend]', error.message)
    if (!/rate limit/i.test(error.message) && error.status !== 429) reportError({ source: 'server', context: 'POST /api/auth/resend', error })
  }
  // Misma respuesta exista o no la cuenta (no revelar qué correos están registrados)
  return NextResponse.json({ ok: true })
}
