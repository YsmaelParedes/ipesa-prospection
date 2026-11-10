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
