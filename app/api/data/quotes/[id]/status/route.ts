import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'
import { activityKindFor } from '@/lib/quotes'
import { getQuote, quoteToClient, storeToday, type QuoteRow } from '@/lib/quotesServer'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/data/quotes/[id]/status — { status: accepted | rejected | sent, registerSale?, registerLost? }
 * Aceptada puede registrar la venta en el sistema comercial; Rechazada, «No
 * interesado» (así sale de Oportunidades); «sent» la reabre.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const status = body.status
  if (status !== 'accepted' && status !== 'rejected' && status !== 'sent') return jsonError('Estado inválido')

  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    const { data, error } = await getServerSupabase().rpc('decide_quote', {
      p_store: ctx.storeId, p_actor: ctx.uid, p_quote: q.id, p_status: status,
      p_sale: (status === 'accepted' && body.registerSale === true) || (status === 'rejected' && body.registerLost === true), p_kind: activityKindFor(q.sent_via), p_today: storeToday(ctx),
    })
    if (error) {
      const known = rpcUserError(error)
      if (known) return jsonError(known.message, known.status)
      throw error
    }
    const names = await getUserNameMap(ctx.storeId).catch(() => new Map<string, string>())
    return NextResponse.json({ quote: quoteToClient(data as QuoteRow, names, storeToday(ctx)) })
  } catch (error) {
    return serverError('POST /api/data/quotes/[id]/status', error, 'No se pudo cambiar el estado')
  }
}
