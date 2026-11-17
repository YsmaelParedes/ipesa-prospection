import type { PublicPrices } from './billing'
import { getPlanPrices, stripeConfigured } from './stripe'

/**
 * Precios de Galón y Cubeta para el HTML del sitio público (solo servidor):
 * así Google y quien comparte el enlace los ven sin esperar al navegador, y
 * van en los datos estructurados. Lee lo mismo que /api/billing/prices.
 * Las páginas que lo usan se regeneran cada hora (`export const revalidate = 3600`,
 * que Next exige escrito como número en cada página).
 * null si Stripe no está configurado o falla: las tarjetas los piden al abrir
 * la página, como antes.
 */
export async function getPublicPrices(): Promise<PublicPrices | null> {
  if (!stripeConfigured()) return null
  try {
    const list = await getPlanPrices()
    return list.length ? Object.fromEntries(list.map(p => [p.plan, p.price])) : null
  } catch (error) {
    console.error('[getPublicPrices]', error instanceof Error ? error.message : error)
    return null
  }
}
