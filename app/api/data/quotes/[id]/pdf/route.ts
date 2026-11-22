import { NextRequest } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, serverError } from '@/lib/validation'
import { pdfFilename } from '@/lib/quotes'
import { getQuote, getQuoteSettings, pdfResponse, quoteStoreOf, renderQuotePdf, sellerNameOf } from '@/lib/quotesServer'
import { quoteFileResponse } from '@/lib/quoteFilesServer'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/data/quotes/[id]/pdf[?inline=1] — el PDF para descargarlo o
 * compartirlo (también en borrador). Una subida lleva a su archivo.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    const inline = req.nextUrl.searchParams.get('inline') === '1'
    if (q.file_path) return await quoteFileResponse(q, inline)
    const [settings, seller] = await Promise.all([getQuoteSettings(ctx.storeId), sellerNameOf(ctx.storeId, q.created_by)])
    const pdf = await renderQuotePdf(q, quoteStoreOf(ctx.store, settings), seller, req.nextUrl.origin)
    return pdfResponse(pdf, pdfFilename(q.folio ?? 0, ctx.store.name), inline)
  } catch (error) {
    return serverError('GET /api/data/quotes/[id]/pdf', error, 'No se pudo generar el PDF')
  }
}
