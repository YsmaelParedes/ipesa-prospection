import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { EMAIL_RE, siteOrigin } from '@/lib/invitations'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { jsonError, readJson } from '@/lib/validation'

// POST /api/auth/resend { email } — reenvía el correo para confirmar la cuenta
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe un correo válido')
  if (!rateLimit(`resend:${clientIp(req)}`, 5, 60 * 60 * 1000) || !rateLimit(`resend:${email}`, 3, 60 * 60 * 1000)) {
    return jsonError('Ya reenviamos el correo varias veces. Revisa spam o intenta en una hora.', 429)
  }

  const supabase = await getAuthClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${siteOrigin(req.nextUrl.origin)}/auth/confirm?next=/bienvenida` },
  })
  if (error) console.error('[POST /api/auth/resend]', error.message)
  // Misma respuesta exista o no la cuenta (no revelar qué correos están registrados)
  return NextResponse.json({ ok: true })
}
