import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { catalogCodes, loadCatalog, searchColors } from '@/lib/formulas'
import { allowedFormulas } from '@/lib/formulaAccess'
import { planOf } from '@/lib/stores'
import { jsonError, serverError } from '@/lib/validation'

async function GETImpl(req: NextRequest, { params }: { params: Promise<{ catalogId: string }> }) {
  const ctx = await requireStore({ module: 'formulas' })
  if (ctx instanceof Response) return ctx

  try {
    const { catalogId } = await params
    const catalog = loadCatalog(catalogId)
    if (!catalog) return jsonError('Catálogo no encontrado', 404)

    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 80)
    // Plan con límite (Litro): solo se busca entre las fórmulas de la tienda
    const limit = planOf(ctx.plan).formulaLimit
    const allowed = allowedFormulas(ctx.storeId, limit, catalogCodes)?.get(catalog.id)
    const pool = allowed ? catalog.colors.filter(c => allowed.has(c.code)) : catalog.colors
    // Solo lo que la UI usa: se omite `raw` (valores originales del PDF) para
    // aligerar la respuesta.
    const colors = searchColors(pool, q, 60).map(c => ({
      code: c.code,
      name: c.name,
      base: c.base,
      swatch: c.swatch,
      colourants: c.colourants.map(({ code, shotsPerLiter, mlPerLiter, needsReview }) => ({ code, shotsPerLiter, mlPerLiter, needsReview })),
    }))

    return NextResponse.json(
      { id: catalog.id, productLine: catalog.productLine, fandeck: catalog.fandeck, colorCount: pool.length, totalColors: catalog.colorCount, formulaLimit: limit, matchCount: colors.length, colors },
      // La caché en memoria del cliente identifica al usuario y la tienda.
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return serverError('GET /api/formulas/:catalogId', error, 'Error al obtener el catálogo')
  }
}

export const GET = withServerTiming(GETImpl)
