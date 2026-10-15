import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { monthBounds } from '@/lib/payments'
import { isUUID, jsonError, serverError } from '@/lib/validation'

const COLUMNS = 'id, store_id, amount, method, paid_on, months, period_start, period_end, invoice_requested, invoice_number, notes, created_at, voided_at, void_reason, stores(name)'

/**
 * GET /api/platform/payments?month=YYYY-MM — pagos recibidos ese mes (por fecha del pago)
 * GET /api/platform/payments?store=<id>   — pagos de una tienda (los más recientes)
 * Incluye los anulados (se muestran tachados).
 */
export async function GET(req: NextRequest) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const month = req.nextUrl.searchParams.get('month')
  const store = req.nextUrl.searchParams.get('store')
  let q = getServerSupabase().from('store_payments').select(COLUMNS)
  if (store) {
    if (!isUUID(store)) return jsonError('Tienda no encontrada', 404)
    q = q.eq('store_id', store).order('created_at', { ascending: false }).limit(50)
  } else {
    const range = monthBounds(month ?? '')
    if (!range) return jsonError('Mes inválido (YYYY-MM)')
    q = q.gte('paid_on', range.from).lt('paid_on', range.to)
      .order('paid_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000)
  }

  const { data, error } = await q
  if (error) return serverError('GET /api/platform/payments', error, 'No se pudieron cargar los pagos')
  const payments = (data ?? []).map(({ stores, amount, ...p }: any) => ({ ...p, amount: Number(amount), store_name: stores?.name ?? null }))
  return NextResponse.json({ payments }, { headers: { 'Cache-Control': 'no-store' } })
}
