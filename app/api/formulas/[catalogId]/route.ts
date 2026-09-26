import { NextRequest, NextResponse } from 'next/server'
import { getUserId, unauthorizedResponse } from '@/lib/supabase-server'
import { loadCatalog, searchColors } from '@/lib/formulas'

export async function GET(req: NextRequest, { params }: { params: Promise<{ catalogId: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { catalogId } = await params
    const catalog = loadCatalog(catalogId)
    if (!catalog) return NextResponse.json({ error: 'Catálogo no encontrado' }, { status: 404 })

    const q = req.nextUrl.searchParams.get('q') ?? ''
    const colors = searchColors(catalog.colors, q, 60)

    return NextResponse.json({
      id: catalog.id,
      productLine: catalog.productLine,
      fandeck: catalog.fandeck,
      colorCount: catalog.colorCount,
      matchCount: colors.length,
      colors,
    })
  } catch (error: any) {
    console.error('[GET /api/formulas/:catalogId]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener el catálogo' }, { status: 500 })
  }
}
