import { getServerSupabase } from './supabase-server'
import type { StoreContext } from './supabase-server'
import type { WhatsAppSendResult } from './whatsapp'
import { CAMPAIGN_DAILY_LIMIT, TEMPLATE_REPEAT_DAYS } from './whatsappSafety'

/**
 * Plantillas enviadas por la tienda en las últimas 24 h (límite diario de
 * lib/whatsappSafety.ts). Un envío rechazado por Meta no cuenta.
 */
export async function templatesSentInLast24h(storeId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await getServerSupabase()
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('direction', 'outbound')
    .not('template_name', 'is', null)
    .neq('status', 'failed')
    .gte('created_at', since)
  if (error) throw error
  return count ?? 0
}

/** Reserva y registra antes del envío: el bloqueo de tienda evita sobrepasar la cuota en paralelo. */
export async function reserveTemplateSend(ctx: Pick<StoreContext, 'storeId' | 'uid'>, input: {
  phone: string; template: string; body: string; contactId: string | null; skipRecent: boolean
}): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string; skipped: boolean }> {
  const { data, error } = await getServerSupabase().rpc('reserve_whatsapp_template', {
    p_store: ctx.storeId, p_actor: ctx.uid, p_phone: input.phone, p_template: input.template,
    p_body: input.body, p_contact: input.contactId, p_limit: CAMPAIGN_DAILY_LIMIT,
    p_repeat_days: TEMPLATE_REPEAT_DAYS, p_skip_recent: input.skipRecent,
  })
  if (error) throw error
  if (data?.allowed === true && typeof data.id === 'string') return { ok: true, id: data.id }
  if (data?.reason === 'quota') return {
    ok: false, status: 429, skipped: false,
    error: `Ya se alcanzó el límite diario de ${CAMPAIGN_DAILY_LIMIT} plantillas enviadas. Intenta de nuevo más tarde.`,
  }
  if (data?.reason === 'opt_out') return { ok: false, status: 200, skipped: true, error: 'Pidió no recibir campañas (dado de baja)' }
  if (data?.reason === 'recent') return {
    ok: false, status: 200, skipped: true, error: `Ya recibió esta plantilla en los últimos ${TEMPLATE_REPEAT_DAYS} días`,
  }
  throw new Error('Respuesta de reserva inválida')
}

/** La reserva ya queda en el historial incluso si Meta o la actualización final fallan. */
export async function finishTemplateSend(id: string, storeId: string, result: WhatsAppSendResult) {
  const { error } = await getServerSupabase().from('whatsapp_messages').update({
    wa_message_id: result.messageId ?? null, status: result.ok ? 'sent' : result.code ? 'failed' : 'pending',
    error_message: result.ok ? null : result.error,
  }).eq('id', id).eq('store_id', storeId)
  if (error) console.error('[whatsapp/finalizar-envío]', error.message)
}
