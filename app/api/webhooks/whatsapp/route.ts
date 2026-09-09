import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

/**
 * GET — verificación del webhook (Meta la llama una sola vez al guardar la
 * configuración en el panel de desarrolladores).
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verificación fallida' }, { status: 403 })
}

/**
 * POST — eventos entrantes de WhatsApp Cloud API: estados de mensajes salientes
 * (sent/delivered/read/failed) y mensajes entrantes de contactos.
 * Siempre responde 200 rápido — Meta reintenta agresivamente si no recibe 200.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = getServerSupabase()

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}

        // Estados de mensajes que nosotros enviamos (campañas)
        for (const status of value.statuses ?? []) {
          const update: Record<string, unknown> = {
            status: status.status, // sent | delivered | read | failed
            updated_at: new Date().toISOString(),
          }
          if (status.status === 'delivered') update.delivered_at = new Date(Number(status.timestamp) * 1000).toISOString()
          if (status.status === 'read')      update.read_at      = new Date(Number(status.timestamp) * 1000).toISOString()
          if (status.errors?.[0]) {
            update.error_code    = String(status.errors[0].code ?? '')
            update.error_message = status.errors[0].title ?? status.errors[0].message ?? ''
          }

          await supabase.from('message_logs').update(update).eq('message_sid', status.id)
        }

        // Mensajes entrantes (respuestas de contactos) — se registran para diagnóstico.
        // Fase 2: enlazar con lead_activities / notificar al vendedor dueño del contacto.
        for (const msg of value.messages ?? []) {
          console.log('[whatsapp webhook] mensaje entrante de', msg.from, '·', msg.text?.body ?? `(${msg.type})`)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[POST /api/webhooks/whatsapp]', error?.message ?? error)
    return NextResponse.json({ received: true })
  }
}
