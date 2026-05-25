import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import webpush from 'web-push'

// Necesario para que Vercel no cachee esta ruta
export const dynamic = 'force-dynamic'

// Configurar VAPID una sola vez
webpush.setVapidDetails(
  'mailto:iysmaelpg@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

// Vercel llama a este endpoint según el cron configurado en vercel.json
export async function GET(req: NextRequest) {
  // Verificar que la llamada viene de Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  // Recordatorios que vencen en los próximos 10 min o vencieron hace máximo 1 hora
  const now      = new Date()
  const inTen    = new Date(now.getTime() + 10 * 60 * 1000)
  const hourAgo  = new Date(now.getTime() - 60 * 60 * 1000)

  const { data: reminders, error: remError } = await supabase
    .from('reminders')
    .select('*')
    .eq('completado', false)
    .gte('reminder_date', hourAgo.toISOString())
    .lte('reminder_date', inTen.toISOString())

  if (remError) return NextResponse.json({ error: remError.message }, { status: 500 })
  if (!reminders?.length) return NextResponse.json({ sent: 0, note: 'Sin recordatorios próximos' })

  // Obtener todas las suscripciones registradas
  const { data: subs } = await supabase.from('push_subscriptions').select('*')
  if (!subs?.length) return NextResponse.json({ sent: 0, note: 'Sin suscripciones' })

  let sent = 0
  const expired: string[] = []

  for (const reminder of reminders) {
    const nota  = reminder.nota || reminder.lead_name || 'Recordatorio pendiente'
    const fecha = new Date(reminder.reminder_date)
    const isPast = fecha < now

    const payload = JSON.stringify({
      title: isPast ? '⏰ Recordatorio vencido' : '🔔 Recordatorio próximo',
      body:  nota + (reminder.lead_id ? ` · Lead: ${reminder.lead_name}` : ''),
      url:   '/recordatorios',
    })

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err: any) {
        // 410 Gone = suscripción expirada, borrarla
        if (err.statusCode === 410 || err.statusCode === 404) {
          expired.push(sub.endpoint)
        }
        console.error('[cron/reminders] push error:', err?.statusCode, err?.message)
      }
    }
  }

  // Limpiar suscripciones expiradas
  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired)
  }

  return NextResponse.json({ sent, reminders: reminders.length, expired: expired.length })
}
