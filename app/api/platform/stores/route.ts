import { NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

// GET /api/platform/stores — todas las tiendas con su dueño, uso y precio acordado (solo plataforma)
export async function GET() {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const db = getServerSupabase()
  const [overview, prices] = await Promise.all([
    db.rpc('platform_store_overview'),
    db.from('stores').select('id, monthly_price'),
  ])
  const error = overview.error ?? prices.error
  if (error) return serverError('GET /api/platform/stores', error, 'No se pudieron cargar las tiendas')
  const priceOf = new Map((prices.data ?? []).map(p => [p.id as string, p.monthly_price === null ? null : Number(p.monthly_price)]))
  const stores = (overview.data ?? []).map((st: { id: string }) => ({ ...st, monthly_price: priceOf.get(st.id) ?? null }))
  return NextResponse.json({ stores }, { headers: { 'Cache-Control': 'no-store' } })
}
