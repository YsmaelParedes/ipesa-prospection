import { NextRequest, NextResponse } from 'next/server'

// ── Rate Limiting (in-memory) ────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 60
const LOGIN_RATE_LIMIT_MAX = 10

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

// ── Session Verification (Web Crypto API for Edge Runtime) ──────────────────
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
    const sigBytes = new Uint8Array(
      (signature.match(/.{2}/g) ?? []).map(b => parseInt(b, 16))
    )
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(token))
  } catch {
    return false
  }
}

// ── Security Headers ────────────────────────────────────────────────────────
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

// ── Proxy Handler ────────────────────────────────────────────────────────────
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // Skip static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Rate limiting for login
  if (pathname === '/api/auth/login') {
    if (!checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT_MAX)) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Demasiados intentos. Espera un momento.' }, { status: 429 })
      )
    }
    return addSecurityHeaders(NextResponse.next())
  }

  // Rate limiting for API routes
  if (pathname.startsWith('/api/') && pathname !== '/api/auth/logout') {
    if (!checkRateLimit(`api:${ip}`, RATE_LIMIT_MAX)) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Límite de solicitudes excedido' }, { status: 429 })
      )
    }
  }

  // Allow webhook without session (Twilio calls it)
  if (pathname === '/api/twilio/webhook') {
    return addSecurityHeaders(NextResponse.next())
  }

  // Allow auth routes and login page
  if (pathname.startsWith('/api/auth/') || pathname === '/login') {
    return addSecurityHeaders(NextResponse.next())
  }

  // Verify session for all other routes
  const secret = process.env.APP_SECRET
  if (!secret) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return addSecurityHeaders(NextResponse.redirect(url))
  }

  const session = req.cookies.get('session')?.value ?? ''
  const valid = await verifySession(session, secret)

  if (!valid) {
    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      )
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return addSecurityHeaders(NextResponse.redirect(url))
  }

  return addSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
