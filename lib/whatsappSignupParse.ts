/**
 * Lectura de lo que llega del alta de WhatsApp en unos clics (Embedded
 * Signup): el aviso de la ventana de Meta en el navegador y el cuerpo que el
 * navegador manda al servidor. Sin dependencias, para usarlo en los dos
 * lados y probarlo.
 */

export const META_ID = /^\d{5,30}$/

/** Lo que la ventana de Meta le avisa a la página al terminar (WA_EMBEDDED_SIGNUP). */
export type SessionInfo = { wabaId: string; phoneNumberId: string | null; businessId: string | null; coexistence: boolean }

/** Lee el aviso de la ventana de Meta (v4: waba_id; v5: messaging_account_ids). 'cancel' si la cerró o falló. */
export function readSessionInfo(raw: unknown): SessionInfo | 'cancel' | null {
  let data: any
  try { data = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return null }
  if (data?.type !== 'WA_EMBEDDED_SIGNUP') return null
  const event = String(data.event ?? '')
  if (event === 'CANCEL' || event === 'ERROR') return 'cancel'
  if (!event.startsWith('FINISH')) return null
  const d = data.data ?? {}
  const wabaId = String(d.waba_id ?? d.messaging_account_ids?.[0] ?? '')
  if (!META_ID.test(wabaId)) return null
  const phone = String(d.phone_number_id ?? '')
  const business = String(d.business_id ?? '')
  return {
    wabaId,
    phoneNumberId: META_ID.test(phone) ? phone : null,
    businessId: META_ID.test(business) ? business : null,
    coexistence: event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || d.is_on_biz_app === true,
  }
}

export type SignupInput = {
  code: string | null
  wabaId: string
  phoneNumberId: string | null
  businessId: string | null
  /** Meta avisó FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (número de WhatsApp Business). */
  coexistence: boolean
}

/** Cuerpo de POST /api/store/whatsapp/connect; null si no trae una cuenta válida. */
export function parseSignupInput(body: Record<string, unknown> | null): SignupInput | null {
  if (!body) return null
  const id = (v: unknown) => (typeof v === 'string' && META_ID.test(v) ? v : null)
  const code = typeof body.code === 'string' && body.code.length > 0 && body.code.length <= 2048 && !/\s/.test(body.code) ? body.code : null
  const wabaId = id(body.wabaId)
  if (!wabaId) return null
  return { code, wabaId, phoneNumberId: id(body.phoneNumberId), businessId: id(body.businessId), coexistence: body.coexistence === true }
}

/** Un número de la cuenta; onBizApp: true si también está en la app WhatsApp Business. */
export type AccountPhone = { id: string; onBizApp?: boolean }

/**
 * El número que eligió la tienda. En coexistencia Meta solo avisa la cuenta
 * (no el número): si la cuenta tiene varios, es el que está en la app
 * WhatsApp Business. null si no se puede saber cuál.
 */
export function pickPhone<P extends AccountPhone>(phones: P[], wanted: string | null, coexistence: boolean): P | null {
  if (wanted) return phones.find(p => p.id === wanted) ?? null
  if (phones.length === 1) return phones[0]
  if (!coexistence) return null
  const onApp = phones.filter(p => p.onBizApp === true)
  return onApp.length === 1 ? onApp[0] : null
}

/** Meta solo deja pedir el historial de chats en las primeras 24 h después de conectar. */
export const HISTORY_WINDOW_MS = 24 * 60 * 60_000

/**
 * ¿Se puede (volver a) pedir el historial? Solo en coexistencia, dentro de
 * las 24 h y si no se pidió todavía o falló (la tienda lo rechazó = no).
 */
export function canRequestHistory(
  row: { coexistence: boolean; connected_at: string | null; history_status: string | null },
  now = Date.now(),
): boolean {
  if (!row.coexistence || !row.connected_at) return false
  if (row.history_status !== null && row.history_status !== 'failed') return false
  const since = now - Date.parse(row.connected_at)
  return Number.isFinite(since) && since >= 0 && since < HISTORY_WINDOW_MS
}

/**
 * Cómo entra la tienda a la ventana de Meta:
 *   · 'app': su número ya está en WhatsApp Business del celular (coexistencia):
 *     lo sigue usando ahí y traemos sus chats.
 *   · 'new': número sin WhatsApp (o que ya borró de la app): alta normal.
 */
export type SignupMode = 'app' | 'new'

/**
 * `extras` de FB.login. Meta solo ofrece conectar un número de WhatsApp
 * Business (coexistencia) si se le pide con featureType; sin eso, el alta
 * normal rechaza el número porque ya está en uso.
 */
export function signupExtras(mode: SignupMode): Record<string, unknown> {
  return mode === 'app'
    ? { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
    : { setup: {}, sessionInfoVersion: '3' }
}
