import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/twilio/webhook']

// Web Crypto API — disponible en Edge Runtime (sin dependencias de Node.js)
async function verifySession(cookie: string, secret: string): Promise<boolean> {
  const dot = cookie.lastIndexOf('.')
  if (dot === -1) return false
  const token = cookie.slice(0, dot)
  const signature = cookie.slice(dot + 1)

  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    // Convertir hex → Uint8Array
    const sigBytes = new Uint8Array(
      (signature.match(/.{2}/g) ?? []).map(b => parseInt(b, 16))
    )
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(token))
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  const secret = process.env.APP_SECRET
  if (!secret) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const session = req.cookies.get('session')?.value ?? ''
  const valid = await verifySession(session, secret)

  if (!valid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
