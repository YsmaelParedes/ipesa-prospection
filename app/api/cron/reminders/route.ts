import { NextRequest, NextResponse } from 'next/server'
import { configureWebPush } from '@/lib/push'
import { authorizeCron, sendDueReminders } from '@/lib/reminderPush'

export const dynamic = 'force-dynamic'

/**
 * Avisos a la hora de cada recordatorio. Lo llama Supabase (pg_cron) en cada
 * minuto en que hay algo por avisar, con un pase de un solo uso — ver
 * supabase/migrations/20261003120500_reminder_push_on_time.sql. También
 * acepta CRON_SECRET para probarlo a mano.
 */
export async function GET(req: NextRequest) {
  if (!(await authorizeCron(req, { allowOneTime: true }))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!configureWebPush()) {
    console.error('[cron/reminders] VAPID keys no configuradas')
    return NextResponse.json({ error: 'VAPID keys no configuradas.' }, { status: 500 })
  }

  try {
    const result = await sendDueReminders()
    if (result.due) console.log('[cron/reminders]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[cron/reminders]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al enviar los avisos' }, { status: 500 })
  }
}
