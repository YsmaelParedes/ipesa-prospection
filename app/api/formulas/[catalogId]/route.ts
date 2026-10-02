import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { loadCatalog, searchColors } from '@/lib/formulas'
import { jsonError, serverError } from '@/lib/validation'

export async function GET(req: NextRequest, { params }: { params: Promise<{ catalogId: string }> }) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  try {
    const { catalogId } = await params
    const catalog = loadCatalog(catalogId)
    if (!catalog) return jsonError('Catálogo no encontrado', 404)

    const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 80)
    // Solo lo que la UI usa: se omite `raw` (valores originales del PDF) para
    // aligerar la respuesta.
    const colors = searchColors(catalog.colors, q, 60).map(c => ({
      code: c.code,
      name: c.name,
      base: c.base,
      swatch: c.swatch,
      colourants: c.colourants.map(({ code, shotsPerLiter, mlPerLiter, needsReview }) => ({ code, shotsPerLiter, mlPerLiter, needsReview })),
    }))

    return NextResponse.json(
      { id: catalog.id, productLine: catalog.productLine, fandeck: catalog.fandeck, colorCount: catalog.colorCount, matchCount: colors.length, colors },
      // Datos estáticos por despliegue: se pueden reutilizar en el navegador.
      { headers: { 'Cache-Control': 'private, max-age=600' } },
    )
  } catch (error) {
    return serverError('GET /api/formulas/:catalogId', error, 'Error al obtener el catálogo')
  }
}
