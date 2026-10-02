import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { loadManifest, loadCatalog } from '@/lib/formulas'
import { serverError } from '@/lib/validation'

export async function GET() {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  try {
    const catalogs = loadManifest().map(entry => ({
      id: entry.id,
      productLine: entry.productLine,
      fandeck: entry.fandeck,
      colorCount: loadCatalog(entry.id)?.colorCount ?? 0,
    }))
    return NextResponse.json({ catalogs }, { headers: { 'Cache-Control': 'private, max-age=600' } })
  } catch (error) {
    return serverError('GET /api/formulas', error, 'Error al obtener catálogos de fórmulas')
  }
}
