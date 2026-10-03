import { NextRequest, NextResponse } from 'next/server'
import { configureWebPush } from '@/lib/push'
import { authorizeCron, sendMorningAgenda } from '@/lib/reminderPush'

export const dynamic = 'force-dynamic'

/**
 * Resumen de la mañana: un aviso por persona con lo que tiene hoy en la Agenda
 * y cuántos pendientes se le vencieron. Lo llama el cron diario de Vercel
 * (vercel.json: 14:00 UTC = 8:00 en el centro de México; en el plan Hobby
 * puede llegar en cualquier minuto de esa hora).
 */
export async function GET(req: NextRequest) {
  // Falla cerrado: sin CRON_SECRET configurado nadie puede dispararlo.
  if (!(await authorizeCron(req))) {
    if (!process.env.CRON_SECRET) console.error('[cron/agenda] CRON_SECRET no configurado — cron deshabilitado')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!configureWebPush()) {
    console.error('[cron/agenda] VAPID keys no configuradas')
    return NextResponse.json({ error: 'VAPID keys no configuradas.' }, { status: 500 })
  }

  try {
    const result = await sendMorningAgenda()
    console.log('[cron/agenda]', JSON.stringify(result))
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[cron/agenda]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al enviar el resumen' }, { status: 500 })
  }
}
