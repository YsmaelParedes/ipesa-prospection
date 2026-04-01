import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

function verifySession(cookie: string): boolean {
  const secret = process.env.APP_SECRET
  if (!secret) return false
  const dot = cookie.lastIndexOf('.')
  if (dot === -1) return false
  const token = cookie.slice(0, dot)
  const signature = cookie.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(token).digest('hex')
  // Comparación segura en tiempo constante
  if (signature.length !== expected.length) return false
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Permitir rutas públicas y assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const session = req.cookies.get('session')?.value ?? ''
  if (!verifySession(session)) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
