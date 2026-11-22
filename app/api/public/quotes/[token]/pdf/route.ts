import { NextRequest } from 'next/server'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { jsonError, serverError } from '@/lib/validation'
import { pdfFilename } from '@/lib/quotes'
import { getPublicQuote, pdfResponse, quoteStoreOf, renderQuotePdf } from '@/lib/quotesServer'
import { quoteFileResponse } from '@/lib/quoteFilesServer'

type Ctx = { params: Promise<{ token: string }> }

/**
 * GET /api/public/quotes/[token]/pdf — el PDF desde el enlace que recibió el
 * cliente (sin sesión). La clave no se puede adivinar; además, un tope por IP
 * porque generar el PDF cuesta.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!rateLimit(`quote-pdf:${clientIp(req)}`, 20, 60_000)) return jsonError('Demasiadas descargas. Intenta en un minuto.', 429)
  const { token } = await params
  try {
    const found = await getPublicQuote(token)
    if (!found) return jsonError('Esta cotización no existe o ya no está disponible', 404)
    const inline = req.nextUrl.searchParams.get('inline') === '1'
    // Una subida lleva a su archivo (PDF o foto)
    if (found.quote.file_path) return await quoteFileResponse(found.quote, inline)
    const pdf = await renderQuotePdf(found.quote, quoteStoreOf(found.store, found.settings), found.seller, req.nextUrl.origin)
    return pdfResponse(pdf, pdfFilename(found.quote.folio ?? 0, found.store.name), inline)
  } catch (error) {
    return serverError('GET /api/public/quotes/[token]/pdf', error, 'No se pudo generar el PDF')
  }
}
