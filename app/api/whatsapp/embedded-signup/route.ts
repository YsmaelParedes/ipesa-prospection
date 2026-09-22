import { NextRequest, NextResponse } from 'next/server'
import { getUserContext, unauthorizedResponse } from '@/lib/supabase-server'

function adminOnly(ctx: Awaited<ReturnType<typeof getUserContext>>) {
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }
  return null
}

function noStore<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store, private')
  return response
}

// Configuracion publica necesaria por el SDK. Nunca expone META_APP_SECRET.
export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  const denied = adminOnly(ctx)
  if (denied) return denied

  const appId = process.env.META_APP_ID ?? ''
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? ''
  const graphVersion = process.env.META_GRAPH_VERSION ?? 'v26.0'
  const appUrl = req.nextUrl.origin.replace(/\/$/, '')

  return noStore({
    appId,
    configId,
    graphVersion,
    configured: Boolean(appId && configId && process.env.META_APP_SECRET),
    webhookUrl: `${appUrl}/api/webhooks/whatsapp`,
    webhookVerifyTokenConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
  })
}

// Cambia el codigo de un solo uso por el token de acceso. El secreto de la app
// vive exclusivamente en el servidor.
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  const denied = adminOnly(ctx)
  if (denied) return denied

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return noStore({ error: 'Cuerpo JSON invalido' }, { status: 400 })
  }

  const code = typeof payload === 'object' && payload !== null && 'code' in payload
    ? (payload as { code?: unknown }).code
    : null

  if (typeof code !== 'string' || code.length < 10 || code.length > 4096) {
    return noStore({ error: 'Codigo de autorizacion invalido' }, { status: 400 })
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  const graphVersion = process.env.META_GRAPH_VERSION ?? 'v26.0'

  if (!appId || !appSecret) {
    return noStore(
      { error: 'Faltan META_APP_ID o META_APP_SECRET en el servidor' },
      { status: 503 }
    )
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  })

  try {
    const graphResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params}`,
      { method: 'GET', cache: 'no-store' }
    )
    const data = await graphResponse.json()

    if (!graphResponse.ok || !data?.access_token) {
      console.error('[Embedded Signup token exchange]', data?.error?.message ?? graphResponse.status)
      return noStore(
        { error: data?.error?.message ?? 'Meta no pudo intercambiar el codigo' },
        { status: 502 }
      )
    }

    return noStore({
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'bearer',
      expiresIn: data.expires_in ?? null,
    })
  } catch (error) {
    console.error('[Embedded Signup token exchange]', error)
    return noStore({ error: 'No se pudo contactar a Meta' }, { status: 502 })
  }
}
