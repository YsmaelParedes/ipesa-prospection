import type { PriceTable } from './billing'
import { getPriceTable, stripeConfigured } from './stripe'

/**
 * Precios de Cubeta (mensual y anual) para el HTML del sitio público
 * (solo servidor): así Google y quien comparte el enlace los ven sin esperar
 * al navegador, y el mensual va en los datos estructurados. Lee lo mismo que
 * /api/billing/prices. Las páginas que lo usan se regeneran cada hora
 * (`export const revalidate = 3600`, que Next exige escrito como número en cada página).
 * null si Stripe no está configurado o falla: las tarjetas los piden al abrir
 * la página, como antes.
 */
export async function getPublicPriceTable(): Promise<PriceTable | null> {
  if (!stripeConfigured()) return null
  try {
    const table = await getPriceTable()
    return Object.keys(table.monthly).length ? table : null
  } catch (error) {
    console.error('[getPublicPriceTable]', error instanceof Error ? error.message : error)
    return null
  }
}
