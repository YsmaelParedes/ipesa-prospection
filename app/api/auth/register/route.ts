import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-server'
import { EMAIL_RE, passwordProblem, siteOrigin } from '@/lib/invitations'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { jsonError, readJson } from '@/lib/validation'

/**
 * POST /api/auth/register — crea la cuenta del dueño de una tienda nueva.
 * La tienda se da de alta después, en el asistente (/bienvenida), ya con la
 * cuenta confirmada: así no quedan tiendas "fantasma" de correos falsos.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return jsonError('Demasiados registros desde esta conexión. Intenta más tarde.', 429)
  }
  const body = await readJson(req)
  const name     = typeof body?.name === 'string' ? body.name.trim() : ''
  const email    = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = body?.password
  if (name.length < 2 || name.length > 60) return jsonError('Escribe tu nombre')
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError('Escribe un correo válido')
  const problem = passwordProblem(password)
  if (problem) return jsonError(problem)
  if (body?.acceptTerms !== true) return jsonError('Debes aceptar los términos y el aviso de privacidad')

  const supabase = await getAuthClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password: password as string,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${siteOrigin(req.nextUrl.origin)}/auth/confirm?next=/bienvenida`,
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('already registered')) return jsonError('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.', 409)
    if (msg.includes('rate limit') || error.status === 429) return jsonError('Se enviaron demasiados correos. Espera unos minutos e intenta de nuevo.', 429)
    if (msg.includes('sending') && msg.includes('email')) return jsonError('No pudimos enviar el correo de confirmación. Intenta más tarde.', 502)
    if (msg.includes('password')) return jsonError('Esa contraseña no cumple los requisitos de seguridad (prueba una más larga, sin palabras comunes).')
    console.error('[POST /api/auth/register]', error.message)
    return jsonError('No se pudo crear la cuenta. Intenta de nuevo.', 500)
  }

  // Con confirmación de correo activa no hay sesión hasta que abra el enlace.
  // (Si el correo ya existía, Supabase responde igual para no revelarlo.)
  return NextResponse.json({ ok: true, needsConfirmation: !data.session })
}
