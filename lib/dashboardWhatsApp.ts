import { getStoreWhatsAppCreds } from './storeWhatsApp'
import { getMessagingLimit, uniqueRecipientsOutsideWindow24h } from './whatsappQuota'

/** Personas contactadas fuera de la ventana en 24 h y límite real de Meta (null = sin límite). */
export async function getDashboardWhatsAppUsage(storeId: string): Promise<{ used: number | null; limit: number | null } | null> {
  try {
    const creds = await getStoreWhatsAppCreds(storeId)
    if (!creds) return { used: null, limit: null }
    const [used, { limit }] = await Promise.all([uniqueRecipientsOutsideWindow24h(storeId), getMessagingLimit(storeId, creds)])
    return { used, limit }
  } catch {
    return null
  }
}
