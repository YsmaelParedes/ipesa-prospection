/**
 * Lo que quedó pendiente de una campaña: las personas que no cupieron en el
 * límite del día de Meta. Se guardan con el mismo mensaje (plantilla y datos
 * escritos) para mandarlas otro día con un toque; el envío conserva el mismo
 * campaign_id, así los resultados se ven juntos. Tabla: campaign_pending.
 * Solo servidor.
 */
import { getServerSupabase } from './supabase-server'
import { sanitizeTemplateParam } from './whatsapp'
import { isUUID } from './validation'

export type CampaignPending = {
  campaignId: string
  label: string | null
  template: string
  language: string
  category: string | null
  headerImageUrl: string | null
  bodyPreview: string
  personalize: boolean
  bodyParams: string[]
  contactIds: string[]
  /** Cuándo se guardó por primera vez (el día que se llegó al límite). */
  createdAt: string
}

/** Pasado este tiempo ya no se ofrece (el mensaje pudo dejar de tener sentido). */
export const PENDING_DAYS = 7

type Row = {
  campaign_id: string; label: string | null; template: string; language: string; category: string | null
  header_image_url: string | null; body_preview: string; personalize: boolean; body_params: string[]
  contact_ids: string[]; created_at: string
}
const FIELDS = 'campaign_id, label, template, language, category, header_image_url, body_preview, personalize, body_params, contact_ids, created_at'

const fromRow = (r: Row): CampaignPending => ({
  campaignId: r.campaign_id, label: r.label, template: r.template, language: r.language, category: r.category,
  headerImageUrl: r.header_image_url, bodyPreview: r.body_preview, personalize: r.personalize,
  bodyParams: r.body_params ?? [], contactIds: r.contact_ids ?? [], createdAt: r.created_at,
})

/** Pendientes de la tienda, el más reciente primero. */
export async function listPending(storeId: string): Promise<CampaignPending[]> {
  const since = new Date(Date.now() - PENDING_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await getServerSupabase().from('campaign_pending').select(FIELDS)
    .eq('store_id', storeId).gte('updated_at', since)
    .order('updated_at', { ascending: false }).limit(20)
  if (error) throw error
  return ((data ?? []) as Row[]).map(fromRow)
}

/**
 * Revisa lo que manda el navegador. Devuelve el texto del problema o los
 * datos listos para guardar.
 */
export function parsePending(body: any): string | Omit<CampaignPending, 'createdAt'> {
  if (!body || typeof body !== 'object') return 'Cuerpo de solicitud inválido'
  const { campaignId, label, template, language, category, headerImageUrl, bodyPreview, personalize, bodyParams, contactIds } = body
  if (!isUUID(campaignId)) return 'campaignId inválido'
  if (typeof template !== 'string' || !/^[a-z0-9_]{1,512}$/.test(template)) return 'template inválido'
  if (typeof language !== 'string' || !/^[a-zA-Z_]{2,10}$/.test(language)) return 'language inválido'
  if (!Array.isArray(contactIds) || contactIds.length < 1 || contactIds.length > 5000 || !contactIds.every(isUUID)) return 'contactIds debe tener de 1 a 5000 contactos'
  let image: string | null = null
  if (headerImageUrl) {
    try { if (new URL(String(headerImageUrl)).protocol !== 'https:') throw new Error() } catch { return 'La imagen de encabezado debe ser una URL https' }
    image = String(headerImageUrl).slice(0, 2000)
  }
  return {
    campaignId, template, language,
    label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : null,
    category: typeof category === 'string' && /^[A-Z_]{1,40}$/.test(category) ? category : null,
    headerImageUrl: image,
    bodyPreview: typeof bodyPreview === 'string' ? bodyPreview.slice(0, 2000) : '',
    personalize: personalize === true,
    bodyParams: Array.isArray(bodyParams) ? bodyParams.slice(0, 20).map(v => (typeof v === 'string' ? sanitizeTemplateParam(v) : '')) : [],
    contactIds: [...new Set(contactIds as string[])],
  }
}

/** Guarda (o reemplaza) lo pendiente de una campaña. */
export async function savePending(storeId: string, userId: string | null, p: Omit<CampaignPending, 'createdAt'>): Promise<void> {
  const { error } = await getServerSupabase().from('campaign_pending').upsert({
    store_id: storeId, campaign_id: p.campaignId, label: p.label, template: p.template, language: p.language,
    category: p.category, header_image_url: p.headerImageUrl, body_preview: p.bodyPreview, personalize: p.personalize,
    body_params: p.bodyParams, contact_ids: p.contactIds, created_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id,campaign_id', ignoreDuplicates: false })
  if (error) throw error
}

export async function deletePending(storeId: string, campaignId: string): Promise<void> {
  const { error } = await getServerSupabase().from('campaign_pending').delete().eq('store_id', storeId).eq('campaign_id', campaignId)
  if (error) throw error
}
