/**
 * Avisos de errores en producción para el dueño de la plataforma.
 * Cada error distinto se guarda una vez (con su contador) en platform_errors y,
 * si toca avisar (reglas anti-ruido en la función report_platform_error), llega
 * un aviso push a los dispositivos del dueño. Nunca lanza error ni bloquea la
 * respuesta: reportar un fallo jamás debe causar otro.
 *
 * Los módulos pesados (Supabase, web-push) se cargan dentro de la función para
 * que importar esto desde lib/validation.ts no arrastre dependencias ni ciclos.
 */
import { after } from 'next/server'
import { APP_NAME } from './brand'
import { cleanContext, cleanMessage, fingerprintOf, isIgnorableError, type ErrorSource } from './errorFingerprint'

export type ReportInput = {
  source: ErrorSource
  /** Dónde pasó: "POST /api/leads", "cron/agenda", "/contactos"… (sin datos de clientes). */
  context: string
  error: unknown
  /** Si no se da, se toma la tienda activa de la cookie de la petición (cuando hay una). */
  storeId?: string | null
}
export type ReportResult = { stored: boolean; notified: boolean; devices: number }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tienda activa según la cookie de la petición actual (solo dentro de una ruta; fuera, null). */
async function activeStoreFromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    const { ACTIVE_STORE_COOKIE } = await import('./supabase-server')
    const value = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value
    return value && UUID_RE.test(value) ? value : null
  } catch {
    return null
  }
}

/** Manda el aviso al celular del dueño (o dueños) de la plataforma. Devuelve a cuántos dispositivos llegó. */
async function notifyPlatformAdmins(input: { fingerprint: string; context: string; message: string; storeId: string | null; test: boolean }): Promise<number> {
  const { getServerSupabase } = await import('./supabase-server')
  const { configureWebPush, sendPushToSubscriptions } = await import('./push')
  const db = getServerSupabase()

  const { data: admins } = await db.from('platform_admins').select('user_id')
  const ids = (admins ?? []).map(a => a.user_id as string)
  if (!ids.length || !configureWebPush()) return 0
  const { data: subs } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
  if (!subs?.length) return 0

  let storeName = ''
  if (input.storeId) {
    const { data } = await db.from('stores').select('name').eq('id', input.storeId).maybeSingle()
    storeName = data?.name ?? ''
  }
  const body = [storeName, input.context, input.message].filter(Boolean).join(' · ').slice(0, 160)
  const result = await sendPushToSubscriptions(subs, {
    title: input.test ? `Prueba de aviso · ${APP_NAME}` : `Error en ${APP_NAME}`,
    body,
    url: '/admin',
    tag: `err-${input.fingerprint.slice(0, 12)}`,
    renotify: true,
  }, { urgency: 'high', ttl: 60 * 60 })
  return result.sent
}

/** Guarda el error y avisa si toca. Espera a terminar; nunca lanza. */
export async function reportErrorNow(input: ReportInput): Promise<ReportResult> {
  const none: ReportResult = { stored: false, notified: false, devices: 0 }
  try {
    if (isIgnorableError(input.error)) return none
    const context = cleanContext(input.context)
    const message = cleanMessage(input.error)
    const fingerprint = fingerprintOf(input.source, context, message)
    const storeId = input.storeId ?? (await activeStoreFromCookie())

    const { getServerSupabase } = await import('./supabase-server')
    const { data, error } = await getServerSupabase().rpc('report_platform_error', {
      p_fingerprint: fingerprint, p_source: input.source, p_context: context, p_message: message, p_store: storeId,
    })
    if (error) { console.error('[errorReport] no se pudo guardar:', error.message); return none }
    if (!data?.stored) return none
    if (!data.notify) return { stored: true, notified: false, devices: 0 }

    const devices = await notifyPlatformAdmins({ fingerprint, context, message, storeId, test: input.source === 'test' })
    return { stored: true, notified: devices > 0, devices }
  } catch (err) {
    console.error('[errorReport]', err instanceof Error ? err.message : err)
    return none
  }
}

/** Reporta sin esperar: se agenda para después de responder (o en segundo plano si no hay petición). */
export function reportError(input: ReportInput): void {
  const run = () => reportErrorNow(input)
  try { after(run) } catch { void run() }
}
