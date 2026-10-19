import { NextResponse } from 'next/server'
import { getPlanPrices, stripeConfigured } from '@/lib/stripe'
import type { PlanPrice } from '@/lib/billing'

/**
 * GET /api/billing/prices — precio mensual de Galón y Cubeta, leído de
 * Stripe (público: lo usan la página de precios y Configuración → Plan).
 * Sin Stripe configurado o si Stripe falla, responde sin precios y la
 * pantalla muestra "Disponible pronto".
 */
export async function GET() {
  const empty = { available: false, prices: {} as Record<string, PlanPrice> }
  if (!stripeConfigured()) return NextResponse.json(empty)
  try {
    const list = await getPlanPrices()
    const prices = Object.fromEntries(list.map(p => [p.plan, p.price]))
    return NextResponse.json({ available: list.length > 0, prices }, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('[GET /api/billing/prices]', error instanceof Error ? error.message : error)
    return NextResponse.json(empty)
  }
}
