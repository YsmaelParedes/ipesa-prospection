import { NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { stripeConfigured } from '@/lib/stripe'
import { billingOverview } from '@/lib/platformBilling'

/**
 * GET /api/platform/billing — ingreso mensual de las suscripciones, lo cobrado
 * en el mes y las facturas vencidas, leídos de Stripe (solo plataforma).
 * Sin Stripe o si Stripe falla responde { available: false } y el Resumen
 * se queda con lo que ya guarda la base.
 */
export async function GET() {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  if (!stripeConfigured()) return NextResponse.json({ available: false })
  try {
    const { data, error } = await getServerSupabase().from('stores').select('stripe_customer_id').not('stripe_customer_id', 'is', null)
    if (error) throw error
    const customers = new Set((data ?? []).map(r => r.stripe_customer_id as string))
    const billing = await billingOverview(customers)
    return NextResponse.json({ available: true, billing }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[GET /api/platform/billing]', error instanceof Error ? error.message : error)
    return NextResponse.json({ available: false })
  }
}
