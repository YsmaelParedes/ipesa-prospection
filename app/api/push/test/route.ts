import { NextResponse } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { configureWebPush, sendPushToSubscriptions } from '@/lib/push'
import { serverError } from '@/lib/validation'

// POST /api/push/test — envía una notificación de prueba al usuario autenticado
export async function POST() {
  const user = await requireUser()
  if (user instanceof Response) return user

  if (!configureWebPush()) {
    return NextResponse.json({ error: 'Las notificaciones no están configuradas en el servidor (faltan las llaves VAPID).' }, { status: 500 })
  }

  const { data: subs, error } = await getServerSupabase()
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id)
  if (error) return serverError('POST /api/push/test', error, 'Error al enviar notificación de prueba')

  if (!subs?.length) {
    return NextResponse.json(
      { error: 'No hay suscripciones registradas para este usuario. Activa las notificaciones en el menú de usuario.' },
      { status: 404 },
    )
  }

  const result = await sendPushToSubscriptions(subs, {
    title: '🔔 IPESA — Prueba exitosa',
    body:  'Las notificaciones push están funcionando correctamente.',
    url:   '/recordatorios',
    tag:   'ipesa-test',
  })
  return NextResponse.json({ sent: result.sent, total: subs.length, expired: result.expired.length })
}
