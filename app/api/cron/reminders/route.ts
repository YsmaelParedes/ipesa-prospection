import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

webpush.setVapidDetails(
  'mailto:iysmaelpg@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

// Corre una vez al día (0 14 * * * = 9am México / 2pm UTC)
// Envía resumen diario con todos los recordatorios pendientes para hoy y vencidos
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const now      = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Todos los pendientes: vencidos + de hoy + próximas 24h
  const { data: reminders, error: remError } = await supabase
    .from('reminders')
    .select('*')
    .eq('completado', false)
    .lte('reminder_date', tomorrow.toISOString())
    .order('reminder_date', { ascending: true })

  if (remError) return NextResponse.json({ error: remError.message }, { status: 500 })
  if (!reminders?.length) return NextResponse.json({ sent: 0, note: 'Sin recordatorios para hoy' })

  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs?.length) return NextResponse.json({ sent: 0, note: 'Sin suscripciones registradas' })

  const overdue  = reminders.filter(r => new Date(r.reminder_date) < now)
  const upcoming = reminders.filter(r => new Date(r.reminder_date) >= now)
  const total    = reminders.length
  const topNota  = reminders[0].nota || reminders[0].lead_name || 'Recordatorio pendiente'

  const bodyParts: string[] = []
  if (overdue.length)  bodyParts.push(`🔴 ${overdue.length} vencido${overdue.length !== 1 ? 's' : ''}`)
  if (upcoming.length) bodyParts.push(`🔵 ${upcoming.length} para hoy`)

  const payload = JSON.stringify({
    title: `📋 IPESA — ${total} recordatorio${total !== 1 ? 's' : ''} pendiente${total !== 1 ? 's' : ''}`,
    body:  bodyParts.join('  ·  ') + `\nPrimero: ${topNota}`,
    url:   '/recordatorios',
  })

  let sent = 0
  const expired: string[] = []

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      sent++
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        expired.push(sub.endpoint)
      }
      console.error('[cron/reminders] push error:', err?.statusCode, err?.message)
    }
  }

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired)
  }

  return NextResponse.json({ sent, reminders: total, expired: expired.length })
}
