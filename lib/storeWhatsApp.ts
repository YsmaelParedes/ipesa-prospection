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
  /** 'embedded': la tienda lo conectó sola con la app de Matices (ver lib/whatsappSignup.ts). */
  connection_method: 'manual' | 'embedded'
  business_id: string | null
  coexistence: boolean
  pin_enc: string | null
  history_status: 'requested' | 'importing' | 'done' | 'declined' | 'failed' | null
  history_imported: number
  setup_error: string | null
}

const COLUMNS = 'store_id, credentials_source, phone_number_id, waba_id, display_phone, access_token_enc, app_secret_enc, verify_token, webhook_key, connected_at, connection_method, business_id, coexistence, pin_enc, history_status, history_imported, setup_error'

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
      // Alta en unos clics: el número usa la app de Matices y su secreto
      appSecret: row.connection_method === 'embedded'
        ? process.env.WHATSAPP_APP_SECRET || null
        : row.app_secret_enc ? decryptSecret(row.app_secret_enc, row.store_id) : null,
    }
  } catch (error) {
    console.error('[whatsapp] no se pudieron descifrar las credenciales de la tienda', row.store_id, error)
    return null
  }
}

export async function getStoreWhatsAppRow(storeId: string): Promise<StoreWhatsAppRow | null> {
  const { data, error } = await getServerSupabase().from('store_whatsapp').select(COLUMNS).eq('store_id', storeId).maybeSingle()
  if (error) throw error
  return (data as StoreWhatsAppRow | null) ?? null
}

/** Credenciales listas para usar, o null si la tienda no ha conectado WhatsApp. */
export async function getStoreWhatsAppCreds(storeId: string): Promise<WhatsAppCreds | null> {
  const row = await getStoreWhatsAppRow(storeId)
  return row ? credsFromRow(row) : null
}

export const WHATSAPP_NOT_CONNECTED = 'El número de WhatsApp de tu tienda aún no está conectado. Conéctalo en Configuración › WhatsApp.'

/**
 * Tienda dueña de un número que usa la app de Matices: la del número del
 * servidor (variables WHATSAPP_*) o una que lo conectó en unos clics. Solo
 * esas reciben eventos por el webhook central; las que conectaron su propia
 * app de Meta los reciben en /api/webhooks/whatsapp/<clave>, firmados con SU
 * app secret, y nunca por aquí.
 */
export async function findStoreForPhone(phoneNumberId: string): Promise<StoreWhatsAppRow | null> {
  // Cada aviso de Meta pregunta lo mismo: en una campaña grande eran cientos de consultas por minuto
  const hit = storeByPhone.get(phoneNumberId)
  if (hit && Date.now() - hit.at < STORE_BY_PHONE_TTL) return hit.row
  const row = await lookupStoreForPhone(phoneNumberId)
  storeByPhone.set(phoneNumberId, { at: Date.now(), row })
  return row
}

const STORE_BY_PHONE_TTL = 60_000
const storeByPhone = new Map<string, { at: number; row: StoreWhatsAppRow | null }>()

/** Al conectar o desconectar un número (en esta instancia; las demás tardan como mucho un minuto). */
export function forgetStoreForPhone() {
  storeByPhone.clear()
}

async function lookupStoreForPhone(phoneNumberId: string): Promise<StoreWhatsAppRow | null> {
  const db = getServerSupabase()
  if (process.env.WHATSAPP_PHONE_NUMBER_ID && phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const { data } = await db.from('store_whatsapp').select(COLUMNS).eq('credentials_source', 'env').maybeSingle()
    return (data as StoreWhatsAppRow | null) ?? null
  }
  const { data } = await db.from('store_whatsapp').select(COLUMNS)
    .eq('phone_number_id', phoneNumberId).eq('connection_method', 'embedded').not('access_token_enc', 'is', null).maybeSingle()
  return (data as StoreWhatsAppRow | null) ?? null
}

/** Tienda que conectó en unos clics esa cuenta de WhatsApp (avisos de cuenta de Meta). */
export async function findEmbeddedStoreForWaba(wabaId: string): Promise<StoreWhatsAppRow | null> {
  const { data } = await getServerSupabase().from('store_whatsapp').select(COLUMNS)
    .eq('waba_id', wabaId).eq('connection_method', 'embedded').maybeSingle()
  return (data as StoreWhatsAppRow | null) ?? null
}

export async function findStoreByWebhookKey(key: string): Promise<StoreWhatsAppRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null
  const { data } = await getServerSupabase().from('store_whatsapp').select(COLUMNS).eq('webhook_key', key).maybeSingle()
  return (data as StoreWhatsAppRow | null) ?? null
}
