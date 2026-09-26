import { NextResponse } from 'next/server'
import { getUserId, unauthorizedResponse } from '@/lib/supabase-server'
import { loadManifest, loadCatalog } from '@/lib/formulas'

export async function GET() {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const catalogs = loadManifest().map(entry => {
      const catalog = loadCatalog(entry.id)
      return {
        id: entry.id,
        productLine: entry.productLine,
        fandeck: entry.fandeck,
        colorCount: catalog?.colorCount ?? 0,
      }
    })
    return NextResponse.json({ catalogs })
  } catch (error: any) {
    console.error('[GET /api/formulas]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener catálogos de fórmulas' }, { status: 500 })
  }
}
