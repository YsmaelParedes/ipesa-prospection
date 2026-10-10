import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { loadCampaignDetail } from '@/lib/campaignHistory'
import { jsonError, serverError } from '@/lib/validation'

/**
 * GET /api/whatsapp/campaigns/history/:batchId (solo admin)
 * Detalle de una campaña: cada destinatario con su estado y, si falló, el motivo.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx

  try {
    const { batchId } = await params
    const campaign = await loadCampaignDetail(ctx.storeId, batchId)
    if (!campaign) return jsonError('Campaña no encontrada', 404)
    return NextResponse.json({ campaign })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/history/:batchId', error, 'Error al obtener la campaña')
  }
}
