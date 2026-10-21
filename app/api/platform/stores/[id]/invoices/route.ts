import { NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { stripeConfigured } from '@/lib/stripe'
import { customerInvoices } from '@/lib/platformBilling'
import { isUUID, jsonError, serverError } from '@/lib/validation'

/**
 * GET /api/platform/stores/[id]/invoices — últimas facturas de Stripe de la
 * tienda (solo plataforma). Sin cliente de Stripe: lista vacía.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  const { data: store, error } = await getServerSupabase().from('stores').select('stripe_customer_id').eq('id', id).maybeSingle()
  if (error) return serverError('GET /api/platform/stores/[id]/invoices', error, 'No se pudieron cargar las facturas')
  if (!store) return jsonError('Tienda no encontrada', 404)
  if (!store.stripe_customer_id || !stripeConfigured()) return NextResponse.json({ invoices: [] })
  try {
    const invoices = await customerInvoices(store.stripe_customer_id)
    return NextResponse.json({ invoices }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return serverError('GET /api/platform/stores/[id]/invoices', e, 'Stripe no respondió; intenta de nuevo')
  }
}
