import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:iysmaelpg@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

// POST /api/push/test — envía una notificación de prueba al usuario autenticado
export async function POST(_req: NextRequest) {
  try {
    // Verificar VAPID keys
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Variables NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY no configuradas en producción.' },
        { status: 500 }
      )
    }

    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()

    // Buscar suscripciones del usuario
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', uid)

    if (error) throw error

    if (!subs?.length) {
      return NextResponse.json(
        { error: 'No hay suscripciones registradas para este usuario. Activa las notificaciones en el menú de usuario.' },
        { status: 404 }
      )
    }

    const payload = JSON.stringify({
      title: '🔔 IPESA — Prueba exitosa',
      body:  'Las notificaciones push están funcionando correctamente.',
      url:   '/recordatorios',
    })

    const results: { endpoint: string; ok: boolean; error?: string }[] = []
    const expired: string[] = []

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        results.push({ endpoint: sub.endpoint.slice(-20), ok: true })
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.endpoint)
        results.push({ endpoint: sub.endpoint.slice(-20), ok: false, error: err?.message })
      }
    }

    // Limpiar suscripciones expiradas
    if (expired.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired)
    }

    const sent = results.filter(r => r.ok).length
    return NextResponse.json({ sent, total: subs.length, expired: expired.length, results })
  } catch (e: any) {
    console.error('[POST /api/push/test]', e?.message)
    return NextResponse.json({ error: e?.message ?? 'Error al enviar notificación de prueba' }, { status: 500 })
  }
}
