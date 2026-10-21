import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/reminderPush'
import { reportError } from '@/lib/errorReport'
import { siteOrigin } from '@/lib/invitations'
import { runRetention } from '@/lib/storeRetention'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Eliminación de tiendas inactivas (lib/storeRetention.ts): avisos a 30 y 7
 * días y eliminación al vencer. Lo llama el cron diario de Vercel
 * (vercel.json: 15:00 UTC = 9:00 en el centro de México).
 * ?dry=1 responde qué haría sin enviar correos ni cambiar nada.
 */
export async function GET(req: NextRequest) {
  // Falla cerrado: sin CRON_SECRET configurado nadie puede dispararlo.
  if (!(await authorizeCron(req))) {
    if (!process.env.CRON_SECRET) console.error('[cron/retention] CRON_SECRET no configurado — cron deshabilitado')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'
  try {
    const result = await runRetention({ origin: siteOrigin(req.nextUrl.origin), dryRun })
    console.log('[cron/retention]', JSON.stringify(result))
    if (result.errors.length) {
      reportError({ source: 'cron', context: 'cron/retention', error: new Error(result.errors.join(' | ')) })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[cron/retention]', error?.message ?? error)
    reportError({ source: 'cron', context: 'cron/retention', error })
    return NextResponse.json({ error: 'Error al revisar las tiendas inactivas' }, { status: 500 })
  }
}
