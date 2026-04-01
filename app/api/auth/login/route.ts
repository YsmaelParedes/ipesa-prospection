import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const APP_PASSWORD = process.env.APP_PASSWORD
const APP_SECRET = process.env.APP_SECRET

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

  const { password } = await req.json()

  // Comparación segura en tiempo constante para evitar timing attacks
  const submitted = Buffer.from(password ?? '')
  const expected = Buffer.from(APP_PASSWORD)
  const match =
    submitted.length === expected.length &&
    timingSafeEqual(submitted, expected)

  if (!match) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 })
  }

  const token = randomBytes(32).toString('hex')
  const signature = sign(token)
  const cookieValue = `${token}.${signature}`

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 días
    path: '/',
  })
  return res
}
