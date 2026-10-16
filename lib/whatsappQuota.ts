import { getServerSupabase } from './supabase-server'
import type { StoreContext } from './supabase-server'
import { getPhoneHealth, type PhoneHealth, type WhatsAppCreds, type WhatsAppSendResult } from './whatsapp'
import { FALLBACK_MESSAGING_LIMIT, MARKETING_RETRY_HOURS, TIER_LIMITS } from './whatsappSafety'

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

/** Reserva y registra antes del envío: el bloqueo de tienda evita sobrepasar el límite en paralelo. */
export async function reserveTemplateSend(ctx: Pick<StoreContext, 'storeId' | 'uid'>, input: {
  phone: string; template: string; body: string; contactId: string | null
  /** Límite de Meta (null = sin límite). */
  limit: number | null
  /** Plantilla de marketing (o de categoría desconocida): aplica la espera de 24 h tras un 131049. */
  marketing: boolean
}): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string; skipped: boolean }> {
  const { data, error } = await getServerSupabase().rpc('reserve_whatsapp_template', {
    p_store: ctx.storeId, p_actor: ctx.uid, p_phone: input.phone, p_template: input.template,
    p_body: input.body, p_contact: input.contactId, p_limit: input.limit, p_marketing: input.marketing,
  })
  if (error) throw error
  if (data?.allowed === true && typeof data.id === 'string') return { ok: true, id: data.id }
  if (data?.reason === 'quota') return {
    ok: false, status: 429, skipped: false,
    error: `Ya se alcanzó el límite de Meta de ${input.limit?.toLocaleString('es-MX')} personas en 24 h. Puedes seguir escribiendo a quien te haya escrito en las últimas 24 h; para el resto, intenta más tarde.`,
  }
  if (data?.reason === 'opt_out') return { ok: false, status: 200, skipped: true, error: 'Pidió no recibir campañas (dado de baja)' }
  if (data?.reason === 'marketing_limit') return {
    ok: false, status: 200, skipped: true,
    error: `Meta pidió esperar ${MARKETING_RETRY_HOURS} h antes de reenviarle marketing (límite por persona)`,
  }
  throw new Error('Respuesta de reserva inválida')
}

/** La reserva ya queda en el historial incluso si Meta o la actualización final fallan. */
export async function finishTemplateSend(id: string, storeId: string, result: WhatsAppSendResult, contactId: string | null = null) {
  const supabase = getServerSupabase()
  const { error } = await supabase.from('whatsapp_messages').update({
    wa_message_id: result.messageId ?? null, status: result.ok ? 'sent' : result.code ? 'failed' : 'pending',
    error_message: result.ok ? null : result.error,
    error_code: result.ok ? null : result.code ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('store_id', storeId)
  if (error) console.error('[whatsapp/finalizar-envío]', error.message)
  if (result.code === 131050 && contactId) await markOptOut(storeId, contactId)
}

/** 131050: el cliente se dio de baja del marketing y Meta pide no reintentar. */
export async function markOptOut(storeId: string, contactId: string) {
  const { error } = await getServerSupabase().from('contacts')
    .update({ wa_opt_out: true, wa_opt_out_at: new Date().toISOString() })
    .eq('id', contactId).eq('store_id', storeId).eq('wa_opt_out', false)
  if (error) console.error('[whatsapp/baja-131050]', error.message)
}
