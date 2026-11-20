import { NextRequest, NextResponse } from 'next/server'
import { authorizeCron } from '@/lib/reminderPush'
import { reportError } from '@/lib/errorReport'
import { siteOrigin } from '@/lib/invitations'
import { runRetention } from '@/lib/storeRetention'
import { runTrialNotices } from '@/lib/trialNotices'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Eliminación de tiendas inactivas (lib/storeRetention.ts): avisos a 30 y 7
 * días y eliminación al vencer. Además, los correos del fin de la prueba de
 * Cubeta (lib/trialNotices.ts). Lo llama el cron diario de Vercel
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
    const origin = siteOrigin(req.nextUrl.origin)
    // Los avisos de la prueba no dependen de la limpieza: si uno falla, el otro sigue
    const [retention, trial] = await Promise.allSettled([runRetention({ origin, dryRun }), runTrialNotices({ origin, dryRun })])
    const result = retention.status === 'fulfilled' ? retention.value : null
    const trialResult = trial.status === 'fulfilled' ? trial.value : null
    console.log('[cron/retention]', JSON.stringify({ ...result, trial: trialResult }))
    const errors = [
      ...(retention.status === 'rejected' ? [`retención: ${retention.reason instanceof Error ? retention.reason.message : String(retention.reason)}`] : result?.errors ?? []),
      ...(trial.status === 'rejected' ? [`prueba: ${trial.reason instanceof Error ? trial.reason.message : String(trial.reason)}`] : trialResult?.errors ?? []),
    ]
    if (errors.length) reportError({ source: 'cron', context: 'cron/retention', error: new Error(errors.join(' | ')) })
    if (retention.status === 'rejected' && trial.status === 'rejected') throw retention.reason
    return NextResponse.json({ ...result, trial: trialResult })
  } catch (error: any) {
    console.error('[cron/retention]', error?.message ?? error)
    reportError({ source: 'cron', context: 'cron/retention', error })
    return NextResponse.json({ error: 'Error al revisar las tiendas inactivas' }, { status: 500 })
  }
}
