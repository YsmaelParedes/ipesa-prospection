import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { loadCampaignSummaries } from '@/lib/campaignHistory'
import { serverError } from '@/lib/validation'

/**
 * GET /api/whatsapp/campaigns/history?days=30 (solo admin)
 * Cada envío de plantillas por separado, con cuántos mensajes se leyeron,
 * entregaron, siguen pendientes o no se entregaron (y por qué).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90)
  try {
    const campaigns = await loadCampaignSummaries(ctx.storeId, days)
    return NextResponse.json({ days, campaigns })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/history', error, 'Error al obtener el historial de campañas')
  }
}
