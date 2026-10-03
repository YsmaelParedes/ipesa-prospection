import { NextRequest, NextResponse } from 'next/server'
import { APP_NAME } from '@/lib/brand'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { configureWebPush, sendPushToSubscriptions } from '@/lib/push'
import { readJson, serverError } from '@/lib/validation'

// POST /api/push/test — aviso de prueba. Con { endpoint } va solo a ese
// dispositivo (el que pulsó "Enviar prueba"); sin él, a todos los del usuario.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof Response) return user

  if (!configureWebPush()) {
    return NextResponse.json({ error: 'Las notificaciones no están configuradas en el servidor (faltan las llaves VAPID).' }, { status: 500 })
  }

  const body = await readJson(req)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null

  let query = getServerSupabase().from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', user.id)
  if (endpoint) query = query.eq('endpoint', endpoint)
  const { data: subs, error } = await query
  if (error) return serverError('POST /api/push/test', error, 'Error al enviar notificación de prueba')

  if (!subs?.length) {
    return NextResponse.json(
      { error: 'Este dispositivo no está registrado. Desactiva y vuelve a activar los avisos.', code: 'NOT_REGISTERED' },
      { status: 404 },
    )
  }

  const result = await sendPushToSubscriptions(subs, {
    title: `🔔 ${APP_NAME} — Prueba exitosa`,
    body:  'Así te llegarán los avisos de tu agenda y de tus clientes en este dispositivo.',
    url:   '/recordatorios',
    tag:   'crm-test',
  })
  return NextResponse.json({ sent: result.sent, total: subs.length, expired: result.expired.length, failed: result.failed })
}
