import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

/** GET /api/data/quotes/suggestions?q= — productos ya cotizados en la tienda, con su unidad y último precio. */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
  try {
    const { data, error } = await getServerSupabase().rpc('quote_item_suggestions', { p_store: ctx.storeId, p_query: q, p_limit: 8 })
    if (error) throw error
    const suggestions = ((data ?? []) as { description: string; unit: string; price: number | string }[])
      .map(s => ({ description: s.description, unit: s.unit, price: Number(s.price) }))
    return NextResponse.json({ suggestions })
  } catch (error) {
    return serverError('GET /api/data/quotes/suggestions', error, 'No se pudieron cargar las sugerencias')
  }
}
