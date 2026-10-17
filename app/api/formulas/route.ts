import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { loadManifest, loadCatalog } from '@/lib/formulas'
import { serverError } from '@/lib/validation'

async function GETImpl() {
  const ctx = await requireStore({ module: 'formulas' })
  if (ctx instanceof Response) return ctx

  try {
    const catalogs = loadManifest().map(entry => ({
      id: entry.id,
      productLine: entry.productLine,
      fandeck: entry.fandeck,
      colorCount: loadCatalog(entry.id)?.colorCount ?? 0,
    }))
    return NextResponse.json({ catalogs }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return serverError('GET /api/formulas', error, 'Error al obtener catálogos de fórmulas')
  }
}

export const GET = withServerTiming(GETImpl)
