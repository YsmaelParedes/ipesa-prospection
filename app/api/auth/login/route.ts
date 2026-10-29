import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { readJson } from '@/lib/validation'
import { clientIp, DAY, hashKey, limitShared, MIN, tooMany } from '@/lib/rateLimit'
import { TURNSTILE_ERROR, verifyTurnstile } from '@/lib/turnstile'

/**
 * Límites (compartidos entre servidores, ver lib/rateLimit.ts):
 *  · por conexión: 10 intentos en 15 min y 60 al día
 *  · por cuenta: 8 intentos en 15 min, venga de donde venga (frena a quien
 *    prueba contraseñas de una cuenta desde muchas conexiones)
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const tooManyLogins = () => tooMany('Demasiados intentos. Por favor espera 15 minutos.', 15 * 60)
  if (!(await limitShared([
    { key: `login:ip:${ip}`, max: 10, windowMs: 15 * MIN },
    { key: `login:ipday:${ip}`, max: 60, windowMs: DAY },
  ]))) return tooManyLogins()

  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 })

  const { email, password } = body
  if (!(await verifyTurnstile(body.captcha, req, 'login'))) {
    return NextResponse.json({ error: TURNSTILE_ERROR, code: 'CAPTCHA' }, { status: 403 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Correo y contraseña son requeridos' }, { status: 400 })
  }
  if (typeof email !== 'string' || email.length > 254) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length > 128) {
    return NextResponse.json({ error: 'Contraseña inválida' }, { status: 400 })
  }
  if (!(await limitShared([{ key: `login:acct:${hashKey(email)}`, max: 8, windowMs: 15 * MIN }]))) return tooManyLogins()

  // Las cookies de sesión se juntan aquí y se ponen en la respuesta final
  const sessionCookies: { name: string; value: string; options: Parameters<NextResponse['cookies']['set']>[2] }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => { sessionCookies.push(...list) },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Supabase solo lo reporta si la contraseña es correcta: no revela cuentas a terceros
    if (error.code === 'email_not_confirmed') {
      return NextResponse.json(
        { error: 'Tu correo aún no está confirmado. Abre el enlace que te enviamos al registrarte.', code: 'EMAIL_NOT_CONFIRMED' },
        { status: 403 }
      )
    }
    return NextResponse.json(
      { error: 'Credenciales incorrectas. Verifica tu correo y contraseña.' },
      { status: 401 }
    )
  }

  const res = NextResponse.json({ ok: true, home: '/' })
  sessionCookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
  return res
}
