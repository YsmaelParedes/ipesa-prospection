import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Auth middleware — runs on every page request (NOT API routes or static assets).
 *
 * Uses getSession() instead of getUser() because:
 *  - getSession() reads the JWT from cookies: no network call when token is valid
 *  - getUser() ALWAYS makes an HTTP call to Supabase to validate the token
 *  - For route protection (redirect vs render) a local cookie check is sufficient
 *  - API routes still use getUserId() → getUser() for actual authorization
 */

// ── In-memory rate limiter for API routes ────────────────────────────────────
// Limits: 120 requests per IP per minute for all /api/* routes.
// NOTE: Resets on cold starts. For production at scale use Upstash Rate Limit.
// ⚠️ REVISAR: replace with @upstash/ratelimit for persistent rate limiting.
const apiRateLimit = new Map<string, { count: number; windowStart: number }>()
const API_RATE_LIMIT_MAX    = 120
const API_RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute in ms

function checkApiRateLimit(ip: string): boolean {
  const now    = Date.now()
  const record = apiRateLimit.get(ip)

  if (!record || now - record.windowStart > API_RATE_LIMIT_WINDOW) {
    apiRateLimit.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (record.count >= API_RATE_LIMIT_MAX) return false
  record.count++
  return true
}

function cleanupApiRateLimitMap() {
  const now = Date.now()
  for (const [key, value] of apiRateLimit.entries()) {
    if (now - value.windowStart > API_RATE_LIMIT_WINDOW) apiRateLimit.delete(key)
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Skip Next.js internals and static assets ─────────────────────────────
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|css|webp|txt|mp4|webm)$/i.test(pathname)
  ) {
    return NextResponse.next()
  }

  // ── Rate limit all /api/* routes ─────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    cleanupApiRateLimitMap()
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
             ?? request.headers.get('x-real-ip')
             ?? 'unknown'

    if (!checkApiRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.' },
        { status: 429 }
      )
    }

    // API routes handle their own auth — pass through after rate limit check
    return NextResponse.next()
  }

  // ── Build a response object that will carry any refreshed session cookies ─
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          // Forward updated cookies both to the request (so downstream server
          // components see them) and to the response (so the browser stores them).
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          list.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() is fast: reads JWT from cookie, only makes a network call
  // when the access token has expired and needs to be refreshed (~every 1 h).
  const { data: { session } } = await supabase.auth.getSession()

  // ── Unauthenticated → send to /login ────────────────────────────────────
  if (!session && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Already authenticated → skip the login page ─────────────────────────
  if (session && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // Run on everything except Next.js static-file internals
  matcher: ['/((?!_next/static|_next/image).*)'],
}
