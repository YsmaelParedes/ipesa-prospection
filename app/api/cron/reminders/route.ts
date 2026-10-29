import { NextRequest, NextResponse } from 'next/server'
import { configureWebPush } from '@/lib/push'
import { authorizeCron, sendDueReminders } from '@/lib/reminderPush'
import { reportError } from '@/lib/errorReport'

export const dynamic = 'force-dynamic'

/**
 * Avisos a la hora de cada recordatorio. Lo llama cada minuto el Worker de
 * Cloudflare de workers/avisos con su llave (tabla cron_keys). También acepta
 * CRON_SECRET para probarlo a mano.
 */
export async function GET(req: NextRequest) {
  if (!(await authorizeCron(req, { allowKeys: true }))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!configureWebPush()) {
    console.error('[cron/reminders] VAPID keys no configuradas')
    reportError({ source: 'cron', context: 'cron/reminders', error: new Error('VAPID keys no configuradas') })
    return NextResponse.json({ error: 'VAPID keys no configuradas.' }, { status: 500 })
  }

  try {
    const result = await sendDueReminders()
    if (result.due) console.log('[cron/reminders]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[cron/reminders]', error?.message ?? error)
    reportError({ source: 'cron', context: 'cron/reminders', error })
    return NextResponse.json({ error: 'Error al enviar los avisos' }, { status: 500 })
  }
}
