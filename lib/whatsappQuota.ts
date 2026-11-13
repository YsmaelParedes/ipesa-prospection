import { getServerSupabase } from './supabase-server'
import { getPhoneHealth, type PhoneHealth, type WhatsAppCreds } from './whatsapp'
import { FALLBACK_MESSAGING_LIMIT, TIER_LIMITS } from './whatsappSafety'

export type MessagingLimit = {
  /** Personas únicas por 24 h fuera de la ventana; null = sin límite. */
  limit: number | null
  tier: string | null
  health: PhoneHealth | null
}

// El nivel cambia como mucho una vez cada 6 h: se consulta a Meta cada 10 min
// por tienda e instancia en vez de en cada envío.
const limitCache = new Map<string, { at: number; value: MessagingLimit }>()
const LIMIT_TTL = 10 * 60 * 1000

/**
 * Límite de mensajería real del portafolio en Meta, con la salud del número.
 * Si Meta no responde se usa 250, el nivel oficial más bajo.
 */
export async function getMessagingLimit(storeId: string, creds: WhatsAppCreds, { fresh = false } = {}): Promise<MessagingLimit> {
  const hit = limitCache.get(storeId)
  if (!fresh && hit && Date.now() - hit.at < LIMIT_TTL) return hit.value
  const health = await getPhoneHealth(creds)
  const tier = health?.messagingLimitTier ?? null
  const value: MessagingLimit = tier && tier in TIER_LIMITS
    ? { limit: TIER_LIMITS[tier], tier, health }
    : { limit: FALLBACK_MESSAGING_LIMIT, tier, health }
  // Solo se guarda si Meta respondió: el respaldo no debe quedarse 10 min.
  if (health) limitCache.set(storeId, { at: Date.now(), value })
  return value
}

/**
 * Personas únicas a las que la tienda mandó plantilla fuera de la ventana de
 * atención en las últimas 24 h — lo mismo que cuenta Meta para su límite.
 * Un envío rechazado por Meta no cuenta.
 */
export async function uniqueRecipientsOutsideWindow24h(storeId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const phones = new Set<string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getServerSupabase()
      .from('whatsapp_messages')
      .select('phone')
      .eq('store_id', storeId)
      .eq('direction', 'outbound')
      .not('template_name', 'is', null)
      .neq('status', 'failed')
      .not('outside_window', 'is', false)
      .gte('created_at', since)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) phones.add(r.phone)
    if (!data || data.length < PAGE) break
  }
  return phones.size
}

/** 131050: el cliente se dio de baja del marketing y Meta pide no reintentar. */
export async function markOptOut(storeId: string, contactId: string) {
  const { error } = await getServerSupabase().from('contacts')
    .update({ wa_opt_out: true, wa_opt_out_at: new Date().toISOString() })
    .eq('id', contactId).eq('store_id', storeId).eq('wa_opt_out', false)
  if (error) console.error('[whatsapp/baja-131050]', error.message)
}
