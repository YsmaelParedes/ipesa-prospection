import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

// Corre una vez al día a las 9am México / 14:00 UTC  (0 14 * * *)
// Envía una notificación INDIVIDUAL por cada recordatorio pendiente:
//   · vencidos (overdue)
//   · programados para las próximas 25 h
// La columna push_sent evita reenvíos si el cron corre dos veces en el mismo día.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('[cron/reminders] VAPID keys no configuradas')
    return NextResponse.json({ error: 'VAPID keys no configuradas.' }, { status: 500 })
  }

  webpush.setVapidDetails(
    'mailto:iysmaelpg@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  const supabase = getServerSupabase()
  const now     = new Date()
  const horizon = new Date(now.getTime() + 25 * 60 * 60 * 1000)  // +25 h

  // Todos los recordatorios pendientes del día:
  // vencidos (< now) + próximas 25 h — solo los que aún no notificamos hoy
  const { data: reminders, error: remError } = await supabase
    .from('reminders')
    .select('id, user_id, lead_name, nota, reminder_date')
    .eq('completado', false)
    .eq('push_sent', false)
    .not('user_id', 'is', null)
    .lte('reminder_date', horizon.toISOString())
    .order('reminder_date', { ascending: true })

  if (remError) {
    console.error('[cron/reminders] error reminders:', remError.message)
    return NextResponse.json({ error: remError.message }, { status: 500 })
  }

  if (!reminders?.length) {
    return NextResponse.json({ sent: 0, note: 'Sin recordatorios para notificar' })
  }

  // Solo las suscripciones de los usuarios con recordatorios pendientes
  const userIds = [...new Set(reminders.map(r => r.user_id))]

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  if (subsError) {
    console.error('[cron/reminders] error subs:', subsError.message)
    return NextResponse.json({ error: subsError.message }, { status: 500 })
  }

  // Usuarios sin suscripción: marcar push_sent para no reintentar
  if (!subs?.length) {
    await supabase
      .from('reminders')
      .update({ push_sent: true })
      .in('id', reminders.map(r => r.id))
    return NextResponse.json({ sent: 0, note: 'Sin suscripciones push activas' })
  }

  // Índice subs por user_id
  const subsByUser = new Map<string, typeof subs>()
  for (const sub of subs) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
    subsByUser.get(sub.user_id)!.push(sub)
  }

  let sent       = 0
  let failed     = 0
  const expired: string[] = []
  const sentIds:  string[] = []

  for (const rem of reminders) {
    const userSubs = subsByUser.get(rem.user_id)

    // Sin suscripción → igual marcar para no repetir mañana
    if (!userSubs?.length) {
      sentIds.push(rem.id)
      continue
    }

    const nota      = rem.nota?.trim() || rem.lead_name?.trim() || 'Recordatorio pendiente'
    const remDate   = new Date(rem.reminder_date)
    const isOverdue = remDate < now

    // Formato del horario local del recordatorio (HH:MM)
    const hh = String(remDate.getHours()).padStart(2, '0')
    const mm = String(remDate.getMinutes()).padStart(2, '0')

    const title = isOverdue ? '⏰ Recordatorio vencido' : `🔔 Hoy a las ${hh}:${mm}`
    const body  = nota

    const payload = JSON.stringify({ title, body, url: '/recordatorios' })

    let remSent = false
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent++
        remSent = true
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expired.push(sub.endpoint)
        } else {
          console.error(`[cron/reminders] push error user=${rem.user_id}:`, err?.statusCode, err?.message)
          failed++
        }
      }
    }

    if (remSent || userSubs.every(s => expired.includes(s.endpoint))) {
      sentIds.push(rem.id)
    }
  }

  // Marcar como notificados
  if (sentIds.length) {
    await supabase
      .from('reminders')
      .update({ push_sent: true })
      .in('id', sentIds)
  }

  // Limpiar subs expiradas
  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired)
    console.log(`[cron/reminders] subs expiradas eliminadas: ${expired.length}`)
  }

  console.log(`[cron/reminders] ok — enviadas: ${sent}, fallidas: ${failed}, recordatorios: ${reminders.length}, expiradas: ${expired.length}`)
  return NextResponse.json({ sent, failed, reminders: reminders.length, expired: expired.length })
}
