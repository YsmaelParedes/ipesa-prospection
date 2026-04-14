import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

function verifySession(cookieValue: string | undefined): boolean {
  const secret = process.env.APP_SECRET
  if (!cookieValue || !secret) return false

  const dotIndex = cookieValue.lastIndexOf('.')
  if (dotIndex === -1) return false

  const token     = cookieValue.slice(0, dotIndex)
  const signature = cookieValue.slice(dotIndex + 1)
  if (!token || !signature) return false

  try {
    const expected = createHmac('sha256', secret).update(token).digest('hex')
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected,  'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rutas siempre públicas
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/twilio/webhook') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const session = req.cookies.get('session')?.value
  if (verifySession(session)) return NextResponse.next()

  // Sin sesión válida: API → 401, páginas → redirect a login
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
