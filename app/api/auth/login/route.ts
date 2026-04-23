import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const APP_PASSWORD = process.env.APP_PASSWORD
const APP_SECRET = process.env.APP_SECRET

// In-memory rate limiter: IP → { count, resetAt }
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  if (entry.count > MAX_ATTEMPTS) return true

  return false
}

function sign(token: string): string {
  return createHmac('sha256', APP_SECRET!).update(token).digest('hex')
}

export async function POST(req: NextRequest) {
  if (!APP_PASSWORD || !APP_SECRET) {
    return NextResponse.json(
      { error: 'APP_PASSWORD y APP_SECRET deben estar definidos en el entorno' },
      { status: 500 }
    )
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
      { status: 429 }
    )
  }

  const { password } = await req.json()

  const submitted = Buffer.from(password ?? '')
  const expected = Buffer.from(APP_PASSWORD)
  const match =
    submitted.length === expected.length &&
    timingSafeEqual(submitted, expected)

  if (!match) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  // Reset counter on successful login
  attempts.delete(ip)

  const token = randomBytes(32).toString('hex')
  const signature = sign(token)
  const cookieValue = `${token}.${signature}`

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}
