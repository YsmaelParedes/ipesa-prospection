import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { deletePending, listPending, parsePending, savePending } from '@/lib/campaignPending'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

/**
 * GET /api/whatsapp/campaigns/pending (solo admin) — campañas a las que les
 * faltan personas porque se llegó al límite del día de Meta (últimos 7 días).
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  try {
    return NextResponse.json({ pending: await listPending(ctx.storeId) })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/pending', error, 'Error al consultar los envíos pendientes')
  }
}

/**
 * POST /api/whatsapp/campaigns/pending — guarda (o reemplaza) lo que falta de
 * una campaña: { campaignId, label, template, language, category,
 * headerImageUrl, bodyPreview, personalize, bodyParams, contactIds }.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'campaigns', write: true })
  if (ctx instanceof Response) return ctx
  const parsed = parsePending(await readJson(req))
  if (typeof parsed === 'string') return jsonError(parsed)
  try {
    await savePending(ctx.storeId, ctx.uid, parsed)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('POST /api/whatsapp/campaigns/pending', error, 'No se pudo guardar lo pendiente')
  }
}

/** DELETE /api/whatsapp/campaigns/pending?campaignId= — ya se envió o se descartó. */
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'campaigns', write: true })
  if (ctx instanceof Response) return ctx
  const campaignId = req.nextUrl.searchParams.get('campaignId')
  if (!isUUID(campaignId)) return jsonError('campaignId inválido')
  try {
    await deletePending(ctx.storeId, campaignId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('DELETE /api/whatsapp/campaigns/pending', error, 'No se pudo descartar')
  }
}

export const GET = withServerTiming(GETImpl)
