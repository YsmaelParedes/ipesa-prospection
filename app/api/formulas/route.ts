import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { catalogCodes, loadManifest, loadCatalog } from '@/lib/formulas'
import { allowedFormulas } from '@/lib/formulaAccess'
import { planOf } from '@/lib/stores'
import { serverError } from '@/lib/validation'

async function GETImpl() {
  const ctx = await requireStore({ module: 'formulas' })
  if (ctx instanceof Response) return ctx

  try {
    // Plan con límite (Litro): cada catálogo cuenta solo las fórmulas de la tienda
    const limit = planOf(ctx.plan).formulaLimit
    const allowed = allowedFormulas(ctx.storeId, limit, catalogCodes)
    const catalogs = loadManifest().map(entry => ({
      id: entry.id,
      productLine: entry.productLine,
      fandeck: entry.fandeck,
      colorCount: allowed ? allowed.get(entry.id)?.size ?? 0 : loadCatalog(entry.id)?.colorCount ?? 0,
    }))
    return NextResponse.json({ catalogs, formulaLimit: limit }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return serverError('GET /api/formulas', error, 'Error al obtener catálogos de fórmulas')
  }
}

export const GET = withServerTiming(GETImpl)
