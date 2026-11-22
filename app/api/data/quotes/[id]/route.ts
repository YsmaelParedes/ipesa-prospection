import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { getVisibleContact } from '@/lib/commercialServer'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { waChatPhone } from '@/lib/phone'
import { isWindowOpen } from '@/lib/whatsappSafety'
import { removeQuoteFile } from '@/lib/quoteFilesServer'
import {
  QUOTE_COLUMNS, clientFromContact, getQuote, getQuoteSettings, parseQuoteInput, priceListBelongs, quoteStoreOf, quoteToClient, storeToday, totalsFor,
  type QuoteRow,
} from '@/lib/quotesServer'

type Ctx = { params: Promise<{ id: string }> }

/** ¿Se puede mandar el PDF desde el chat de WhatsApp de la tienda? (ventana de 24 h abierta) */
async function chatState(storeId: string, phone: string): Promise<{ available: boolean; open: boolean }> {
  const wa = waChatPhone(phone)
  if (!wa) return { available: false, open: false }
  const { data } = await getServerSupabase().from('whatsapp_messages').select('created_at')
    .eq('store_id', storeId).eq('phone', wa).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return { available: true, open: isWindowOpen(data?.created_at as string | undefined) }
}

/** GET /api/data/quotes/[id] — la cotización, el encabezado de la tienda y si se puede mandar por el chat. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    const [settings, names, chat] = await Promise.all([
      getQuoteSettings(ctx.storeId),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
      ctx.modules.whatsapp && q.client_phone ? chatState(ctx.storeId, q.client_phone) : Promise.resolve({ available: false, open: false }),
    ])
    return NextResponse.json({
      quote: quoteToClient(q, names, storeToday(ctx)),
      header: quoteStoreOf(ctx.store, settings),
      settings,
      chat,
      today: storeToday(ctx),
    })
  } catch (error) {
    return serverError('GET /api/data/quotes/[id]', error, 'Error al abrir la cotización')
  }
}

/**
 * PATCH /api/data/quotes/[id] — guarda cambios del editor (también ya
 * enviada; el enlace siempre muestra lo último). Aceptada o rechazada se
 * reabre antes de editarla. Los totales los recalcula el servidor.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseQuoteInput(body)
  if (!parsed.ok) return jsonError(parsed.error)
  const input = parsed.data

  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    if (q.status === 'accepted' || q.status === 'rejected') return jsonError('Reabre la cotización para editarla', 409)
    if (input.valid_until && input.valid_until < q.issued_on) return jsonError('La validez no puede ser antes de la fecha de la cotización')
    if (input.price_list_id && input.price_list_id !== q.price_list_id && !(await priceListBelongs(ctx.storeId, input.price_list_id))) {
      return jsonError('Esa lista de precios ya no existe', 404)
    }

    // Una subida no tiene renglones: solo cambian el cliente, la validez y el total que se escribió
    const uploaded = !!q.file_path
    const { total, ...rest } = input
    const changes: Record<string, unknown> = uploaded
      ? Object.fromEntries(Object.entries({
          contact_id: input.contact_id, client_name: input.client_name, client_phone: input.client_phone,
          client_email: input.client_email, valid_until: input.valid_until,
        }).filter(([, v]) => v !== undefined))
      : { ...rest }
    // Al elegir otro contacto se copian sus datos (los que no vengan en la petición)
    if (input.contact_id && input.contact_id !== q.contact_id) {
      if (!(await getVisibleContact(ctx, input.contact_id))) return jsonError('Cliente no encontrado', 404)
      const client = await clientFromContact(ctx.storeId, input.contact_id)
      for (const [k, v] of Object.entries(client ?? {})) if (changes[k] === undefined) changes[k] = v
    }
    const next = { ...q, ...changes } as QuoteRow
    const amount = total ?? Number(q.total)
    const totals = uploaded ? { subtotal: amount, discount: 0, tax: 0, total: amount } : totalsFor(next)
    if (!totals) return jsonError('El total es demasiado grande')

    const { data, error } = await getServerSupabase().from('quotes')
      .update({ ...changes, ...totals, updated_at: new Date().toISOString() })
      .eq('id', id).eq('store_id', ctx.storeId).in('status', ['draft', 'sent'])
      .select(QUOTE_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) return jsonError('La cotización cambió de estado. Vuelve a abrirla.', 409)
    const names = await getUserNameMap(ctx.storeId).catch(() => new Map<string, string>())
    return NextResponse.json({ quote: quoteToClient(data as unknown as QuoteRow, names, storeToday(ctx)) })
  } catch (error) {
    return serverError('PATCH /api/data/quotes/[id]', error, 'No se pudieron guardar los cambios')
  }
}

/**
 * DELETE /api/data/quotes/[id] — un borrador lo borra quien lo hizo (o un
 * administrador); una ya enviada, solo un administrador. Lo registrado en el
 * sistema comercial se queda; el archivo de una subida se borra.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    if (q.status !== 'draft' && !ctx.isAdmin) return jsonError('Solo un administrador puede borrar una cotización enviada', 403)
    const { error } = await getServerSupabase().from('quotes').delete().eq('id', id).eq('store_id', ctx.storeId)
    if (error) throw error
    await removeQuoteFile(q.file_path)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('DELETE /api/data/quotes/[id]', error, 'No se pudo borrar la cotización')
  }
}
