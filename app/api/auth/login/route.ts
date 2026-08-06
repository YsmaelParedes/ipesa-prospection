import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * In-memory sliding-window rate limiter for the login endpoint.
 * Limits: 10 attempts per IP per 15-minute window.
 * NOTE: This resets on cold starts (serverless). For production at scale,
 * replace with a Redis-backed solution (e.g. Upstash Rate Limit).
 * ⚠️ REVISAR: consider Upstash @upstash/ratelimit for persistent rate limiting.
 */
const loginAttempts = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_MAX     = 10
const RATE_LIMIT_WINDOW  = 15 * 60 * 1000 // 15 minutes in ms

function checkRateLimit(ip: string): boolean {
  const now    = Date.now()
  const record = loginAttempts.get(ip)

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    loginAttempts.set(ip, { count: 1, windowStart: now })
    return true // allowed
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false // blocked
  }

  record.count++
  return true // allowed
}

// Periodically clean up expired entries to prevent memory growth
function cleanupRateLimitMap() {
  const now = Date.now()
  for (const [key, value] of loginAttempts.entries()) {
    if (now - value.windowStart > RATE_LIMIT_WINDOW) {
      loginAttempts.delete(key)
    }
  }
}

export async function POST(req: NextRequest) {
  // Clean up stale entries on each request
  cleanupRateLimitMap()

  // Extract client IP — Vercel sets x-forwarded-for
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Por favor espera 15 minutos.' },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 })
  }

  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Correo y contraseña son requeridos' }, { status: 400 })
  }
  if (typeof email !== 'string' || email.length > 254) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length > 128) {
    return NextResponse.json({ error: 'Contraseña inválida' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json(
      { error: 'Credenciales incorrectas. Verifica tu correo y contraseña.' },
      { status: 401 }
    )
  }

  return res
}
