/**
 * Conexión del número de WhatsApp de una tienda (solo servidor). La hace el
 * asesor desde el panel de la plataforma (/api/platform/stores/[id]/whatsapp):
 * la tienda no ve ni maneja credenciales, webhook ni nada técnico.
 * Cada tienda usa su propia app de Meta: se guarda su token permanente, el id
 * del número, el id de la cuenta (WABA) y el app secret. Los secretos se
 * cifran antes de llegar a la base y nunca vuelven al navegador.
 */
import { getServerSupabase } from './supabase-server'
import { encryptSecret, hasEncryptionKey } from './crypto'
import { credsFromRow, getStoreWhatsAppRow } from './storeWhatsApp'
import { graphFetch } from './whatsapp'

export type WhatsAppConnectionInfo = {
  connected: boolean
  source: 'store' | 'env'
  phoneNumberId: string | null
  wabaId: string | null
  displayPhone: string | null
  hasAppSecret: boolean
  connectedAt: string | null
  encryptionReady: boolean
  webhook: { url: string; verifyToken: string | null }
}

/** Estado de la conexión y datos para configurar el webhook en Meta. null si la tienda no tiene registro. */
export async function whatsappConnectionInfo(storeId: string, origin: string): Promise<WhatsAppConnectionInfo | null> {
  const row = await getStoreWhatsAppRow(storeId)
  if (!row) return null
  const creds = credsFromRow(row)
  const envSource = row.credentials_source === 'env'
  return {
    connected: !!creds,
    source: row.credentials_source,
    phoneNumberId: envSource ? null : row.phone_number_id,
    wabaId: envSource ? null : row.waba_id,
    displayPhone: row.display_phone,
    hasAppSecret: !!creds?.appSecret,
    connectedAt: row.connected_at,
    encryptionReady: hasEncryptionKey(),
    // La tienda original sigue en el webhook del servidor; las demás tienen el suyo
    webhook: envSource
      ? { url: `${origin}/api/webhooks/whatsapp`, verifyToken: null }
      : { url: `${origin}/api/webhooks/whatsapp/${row.webhook_key}`, verifyToken: row.verify_token },
  }
}

const DIGITS = /^\d{5,30}$/

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

/** { accessToken, phoneNumberId, wabaId, appSecret }: verifica con Meta y guarda cifrado. */
export async function connectStoreWhatsApp(storeId: string, body: any): Promise<Result<{ displayPhone: string | null; verifiedName: string | null }>> {
  if (!hasEncryptionKey()) {
    return { ok: false, status: 503, error: 'El servidor aún no tiene configurada la llave de cifrado (CREDENTIALS_ENCRYPTION_KEY).' }
  }
  const accessToken   = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
  const phoneNumberId = typeof body?.phoneNumberId === 'string' ? body.phoneNumberId.trim() : ''
  const wabaId        = typeof body?.wabaId === 'string' ? body.wabaId.trim() : ''
  const appSecret     = typeof body?.appSecret === 'string' ? body.appSecret.trim() : ''

  const invalid = (error: string): Result<never> => ({ ok: false, status: 400, error })
  if (accessToken.length < 30 || accessToken.length > 1000 || /\s/.test(accessToken)) return invalid('El token de acceso no es válido')
  if (!DIGITS.test(phoneNumberId)) return invalid('El identificador del número (Phone number ID) debe ser numérico')
  if (!DIGITS.test(wabaId)) return invalid('El identificador de la cuenta (WABA ID) debe ser numérico')
  if (!/^[a-f0-9]{32}$/i.test(appSecret)) return invalid('La clave secreta de la app (App Secret) debe tener 32 caracteres hexadecimales')

  const row = await getStoreWhatsAppRow(storeId)
  if (!row) return { ok: false, status: 404, error: 'Configuración de WhatsApp no encontrada' }
  if (row.credentials_source === 'env') {
    return { ok: false, status: 409, error: 'Esta tienda usa la conexión del servidor; se administra desde las variables de entorno.' }
  }
  // El número del servidor solo lo puede tomar la tienda que ya lo usa
  if (phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, status: 409, error: 'Ese número ya está conectado en otra tienda' }
  }

  // Prueba real: el token debe tener acceso a ese número y a esa cuenta
  const creds = { token: accessToken }
  const [phone, numbers] = await Promise.all([
    graphFetch(creds, `${phoneNumberId}?fields=display_phone_number,verified_name`).catch(() => null),
    graphFetch(creds, `${wabaId}/phone_numbers?fields=id&limit=100`).catch(() => null),
  ])
  if (!phone?.ok) return { ok: false, status: 422, error: 'Meta rechazó el token o el número. Revisa que el token sea permanente y tenga permiso whatsapp_business_messaging.' }
  if (!numbers?.ok || !(numbers.data?.data ?? []).some((n: any) => String(n?.id) === phoneNumberId)) {
    return { ok: false, status: 422, error: 'Ese número no pertenece a la cuenta de WhatsApp Business indicada.' }
  }

  const { error } = await getServerSupabase().from('store_whatsapp').update({
    credentials_source: 'store',
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    display_phone: phone.data?.display_phone_number ?? null,
    access_token_enc: encryptSecret(accessToken, storeId),
    app_secret_enc: encryptSecret(appSecret, storeId),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('store_id', storeId)
  if (error) {
    if (error.code === '23505') return { ok: false, status: 409, error: 'Ese número ya está conectado en otra tienda' }
    throw error
  }
  return { ok: true, data: { displayPhone: phone.data?.display_phone_number ?? null, verifiedName: phone.data?.verified_name ?? null } }
}

/** Desconectar: borra las credenciales cifradas. */
export async function disconnectStoreWhatsApp(storeId: string): Promise<Result<null>> {
  const row = await getStoreWhatsAppRow(storeId)
  if (row?.credentials_source === 'env') {
    return { ok: false, status: 409, error: 'Esta tienda usa la conexión del servidor; se administra desde las variables de entorno.' }
  }
  const { error } = await getServerSupabase().from('store_whatsapp').update({
    phone_number_id: null, waba_id: null, display_phone: null,
    access_token_enc: null, app_secret_enc: null, connected_at: null,
    updated_at: new Date().toISOString(),
  }).eq('store_id', storeId)
  if (error) throw error
  return { ok: true, data: null }
}
