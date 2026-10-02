import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { EMAIL_RE, siteOrigin } from '@/lib/invitations'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { jsonError, readJson } from '@/lib/validation'

// POST /api/auth/recover { email } — envía el enlace para restablecer la contraseña
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe un correo válido')
  if (!rateLimit(`recover:${clientIp(req)}`, 5, 60 * 60 * 1000) || !rateLimit(`recover:${email}`, 3, 60 * 60 * 1000)) {
    return jsonError('Ya enviamos varios enlaces. Revisa tu correo o intenta en una hora.', 429)
  }

  const supabase = await getAuthClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin(req.nextUrl.origin)}/auth/confirm?next=/restablecer`,
  })
  if (error) console.error('[POST /api/auth/recover]', error.message)
  // Misma respuesta exista o no la cuenta (no revelar qué correos están registrados)
  return NextResponse.json({ ok: true })
}
