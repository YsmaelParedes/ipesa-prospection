import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

/** GET /api/data/products/facets — categorías, marcas y unidades que ya usa la tienda (filtros y formulario). */
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  try {
    const { data, error } = await getServerSupabase().rpc('product_facets', { p_store: ctx.storeId })
    if (error) throw error
    return NextResponse.json(data as { categories: string[]; brands: string[]; units: string[] })
  } catch (error) {
    return serverError('GET /api/data/products/facets', error, 'No se pudieron cargar las categorías')
  }
}
