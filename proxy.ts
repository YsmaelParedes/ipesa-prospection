import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy (antes "middleware", renombrado en Next.js 16).
 *  - /api/*: bloqueo de escrituras desde otros sitios (CSRF) y límite de
 *    peticiones por IP. Cada route valida su propia sesión con getUser()
 *    (validación real contra Supabase Auth).
 *  - Páginas: sin sesión, "/" muestra la página pública (/inicio) y el resto
 *    de la app manda a /login (con ?next= para volver). Usa getSession()
 *    porque solo lee el JWT de la cookie (sin llamada de red mientras no
 *    expire): basta para decidir redirect vs render; los datos los protege
 *    la API, que valida sesión, tienda y rol en cada petición.
 */

// Páginas que no requieren sesión
const PUBLIC_PATHS    = ['/inicio', '/login', '/registro', '/recuperar', '/restablecer', '/terminos', '/privacidad']
const PUBLIC_PREFIXES = ['/invitacion/', '/auth/']
// Con sesión no tiene sentido verlas: se manda al panel
const GUEST_ONLY      = ['/login', '/registro', '/recuperar']

// ── Rate limit en memoria para /api/* ────────────────────────────────────────
// 120 peticiones por IP por minuto. Se reinicia en cada arranque en frío
// (para algo persistente usar @upstash/ratelimit).
const apiRateLimit = new Map<string, { count: number; windowStart: number }>()
const API_RATE_LIMIT_MAX    = 120
const API_RATE_LIMIT_WINDOW = 60 * 1000

// Webhooks/cron: los manda Meta o Vercel (pocas IPs, ráfagas legítimas) y
// se autentican por firma/secreto, así que no pasan por el límite por IP.
const RATE_LIMIT_EXEMPT = ['/api/webhooks/', '/api/cron/']

// ── CSRF ─────────────────────────────────────────────────────────────────────
// Las cookies de sesión ya son SameSite=Lax; además se rechaza cualquier
// escritura que el navegador marque como enviada desde otro sitio. Las
// peticiones servidor-a-servidor (Meta, Vercel) no mandan Origin.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isCrossSiteWrite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false
  const origin = request.headers.get('origin')
  if (!origin) return false
  let originHost: string
  try { originHost = new URL(origin).host } catch { return true } // "null", basura
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host'), request.nextUrl.host]
  return !hosts.some(h => h?.split(',')[0].trim() === originHost)
}

function checkApiRateLimit(ip: string): boolean {
  const now = Date.now()
  if (apiRateLimit.size > 5000) {
    for (const [key, value] of apiRateLimit) if (now - value.windowStart > API_RATE_LIMIT_WINDOW) apiRateLimit.delete(key)
  }
  const record = apiRateLimit.get(ip)
  if (!record || now - record.windowStart > API_RATE_LIMIT_WINDOW) {
    apiRateLimit.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (record.count >= API_RATE_LIMIT_MAX) return false
  record.count++
  return true
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    if (RATE_LIMIT_EXEMPT.some(p => pathname.startsWith(p))) return NextResponse.next()
    if (isCrossSiteWrite(request)) {
      return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 })
    }
    // Vercel sobrescribe x-forwarded-for con la IP real del cliente
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
             ?? request.headers.get('x-real-ip')
             ?? 'unknown'
    if (!checkApiRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
    return NextResponse.next()
  }

  // ── Respuesta que transporta las cookies de sesión renovadas ─────────────
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { session } } = await supabase.auth.getSession()
  const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))

  if (!session) {
    // La raíz es la página de presentación para quien no ha iniciado sesión
    if (pathname === '/') return NextResponse.rewrite(new URL('/inicio', request.url))
    if (isPublic) return response
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }
  if (GUEST_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  // Todo excepto internos de Next y archivos estáticos de /public
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|css|js|txt|mp4|webm)$).*)'],
}
