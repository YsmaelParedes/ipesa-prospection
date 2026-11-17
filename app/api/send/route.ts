import { NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/site'
import { UMAMI_WEBSITE_ID } from '@/lib/analytics'
import { clientIp } from '@/lib/rateLimit'

/**
 * POST /api/send — puente hacia Umami (estadísticas sin cookies; ver
 * lib/analytics.ts). El script /m.js manda aquí cada visita o evento y esto lo
 * reenvía a Umami con la IP y el navegador de quien visita: sin eso Umami
 * vería la IP de Vercel (país equivocado y todas las visitas mezcladas).
 *
 * Solo acepta el sitio y el dominio de Matices (no sirve de puente para otros
 * sitios) y cuerpos chicos. El límite por IP está en proxy.ts.
 */

const COLLECT_URL = process.env.UMAMI_COLLECT_URL || 'https://gateway.umami.is/api/send'
const HOSTNAME = new URL(SITE_URL).hostname
const MAX_BODY = 16 * 1024
const TYPES = new Set(['event', 'performance'])

const reject = (status: number) => NextResponse.json({}, { status })

export async function POST(req: Request) {
  if (!UMAMI_WEBSITE_ID) return reject(404)

  const text = await req.text()
  if (text.length > MAX_BODY) return reject(413)
  let body: { type?: unknown; payload?: Record<string, unknown> }
  try { body = JSON.parse(text) } catch { return reject(400) }

  const payload = body?.payload
  if (typeof body?.type !== 'string' || !TYPES.has(body.type) || !payload || typeof payload !== 'object') return reject(400)
  if (payload.website !== UMAMI_WEBSITE_ID || payload.hostname !== HOSTNAME) return reject(400)

  const ip = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''
  const cache = req.headers.get('x-umami-cache')
  try {
    const res = await fetch(COLLECT_URL, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'x-umami-website-id': UMAMI_WEBSITE_ID,
        'x-umami-hostname': HOSTNAME,
        ...(ip !== 'unknown' ? { 'X-Forwarded-For': ip } : {}),
        ...(cache ? { 'x-umami-cache': cache } : {}),
      },
      // Umami toma la IP y el navegador del cuerpo antes que de las cabeceras
      body: JSON.stringify({
        type: body.type,
        payload: { ...payload, userAgent, ...(ip !== 'unknown' ? { ip } : {}) },
      }),
    })
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    })
  } catch {
    return reject(502)
  }
}
