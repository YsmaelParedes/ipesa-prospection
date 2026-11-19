import { NextResponse } from 'next/server'
import { getPriceTable, stripeConfigured } from '@/lib/stripe'

/**
 * GET /api/billing/prices — precio de Galón y Cubeta leído de Stripe, mensual
 * (`prices`) y anual (`annual`). Público: lo usan la página de precios y
 * Configuración → Plan. Sin Stripe configurado o si Stripe falla, responde
 * sin precios y la pantalla muestra "Disponible pronto".
 */
export async function GET() {
  const empty = { available: false, prices: {}, annual: {} }
  if (!stripeConfigured()) return NextResponse.json(empty)
  try {
    const { monthly, annual } = await getPriceTable()
    return NextResponse.json({ available: Object.keys(monthly).length > 0, prices: monthly, annual }, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('[GET /api/billing/prices]', error instanceof Error ? error.message : error)
    return NextResponse.json(empty)
  }
}
