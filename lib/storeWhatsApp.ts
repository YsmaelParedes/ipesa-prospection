/**
 * Credenciales de WhatsApp de cada tienda (solo servidor).
 *   · credentials_source 'store': token y app secret cifrados en store_whatsapp.
 *   · credentials_source 'env': la tienda original sigue usando las variables
 *     de entorno del servidor (sin copiar secretos a la base).
 */
import { getServerSupabase } from './supabase-server'
import { decryptSecret } from './crypto'
import type { WhatsAppCreds } from './whatsapp'

export type StoreWhatsAppRow = {
  store_id: string
  credentials_source: 'store' | 'env'
  phone_number_id: string | null
  waba_id: string | null
  display_phone: string | null
  access_token_enc: string | null
  app_secret_enc: string | null
  verify_token: string
  webhook_key: string
  connected_at: string | null
}

const COLUMNS = 'store_id, credentials_source, phone_number_id, waba_id, display_phone, access_token_enc, app_secret_enc, verify_token, webhook_key, connected_at'

export function envWhatsAppCreds(): WhatsAppCreds | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) return null
  return {
    token,
    phoneNumberId,
    wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    appSecret: process.env.WHATSAPP_APP_SECRET || null,
  }
}

export function credsFromRow(row: StoreWhatsAppRow): WhatsAppCreds | null {
  if (row.credentials_source === 'env') return envWhatsAppCreds()
  if (!row.access_token_enc || !row.phone_number_id) return null
  try {
    return {
      token: decryptSecret(row.access_token_enc, row.store_id),
      phoneNumberId: row.phone_number_id,
      wabaId: row.waba_id,
      appSecret: row.app_secret_enc ? decryptSecret(row.app_secret_enc, row.store_id) : null,
    }
  } catch (error) {
    console.error('[whatsapp] no se pudieron descifrar las credenciales de la tienda', row.store_id, error)
    return null
  }
}

export async function getStoreWhatsAppRow(storeId: string): Promise<StoreWhatsAppRow | null> {
  const { data } = await getServerSupabase().from('store_whatsapp').select(COLUMNS).eq('store_id', storeId).maybeSingle()
  return (data as StoreWhatsAppRow | null) ?? null
}

/** Credenciales listas para usar, o null si la tienda no ha conectado WhatsApp. */
export async function getStoreWhatsAppCreds(storeId: string): Promise<WhatsAppCreds | null> {
  const row = await getStoreWhatsAppRow(storeId)
  return row ? credsFromRow(row) : null
}

export const WHATSAPP_NOT_CONNECTED = 'WhatsApp no está conectado en esta tienda. Conéctalo en Configuración → WhatsApp.'

/**
 * Tienda que usa el número del servidor (variables WHATSAPP_*). El webhook
 * compartido solo atiende a esa tienda: las que conectan su propia app de
 * Meta reciben sus eventos en /api/webhooks/whatsapp/<clave>, firmados con
 * SU app secret, y nunca por aquí.
 */
export async function findEnvStoreForPhone(phoneNumberId: string): Promise<StoreWhatsAppRow | null> {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID) return null
  const { data } = await getServerSupabase().from('store_whatsapp').select(COLUMNS)
    .eq('credentials_source', 'env').maybeSingle()
  return (data as StoreWhatsAppRow | null) ?? null
}

export async function findStoreByWebhookKey(key: string): Promise<StoreWhatsAppRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null
  const { data } = await getServerSupabase().from('store_whatsapp').select(COLUMNS).eq('webhook_key', key).maybeSingle()
  return (data as StoreWhatsAppRow | null) ?? null
}
