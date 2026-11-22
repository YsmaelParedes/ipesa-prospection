import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { getVisibleContact } from '@/lib/commercialServer'
import { validateQuoteSettings } from '@/lib/quotes'
import { clientFromContact, getQuoteSettings, quoteStoreOf, storeToday } from '@/lib/quotesServer'

/**
 * GET /api/data/quotes/settings[?contact=] — ajustes de cotizaciones y
 * encabezado de la hoja (para una cotización nueva) y, desde la ficha de un
 * cliente, sus datos. La cotización se guarda hasta que tiene un producto.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const contact = req.nextUrl.searchParams.get('contact')
  if (contact && !isUUID(contact)) return jsonError('Cliente inválido')
  try {
    const [settings, client] = await Promise.all([
      getQuoteSettings(ctx.storeId),
      contact ? getVisibleContact(ctx, contact).then(ok => (ok ? clientFromContact(ctx.storeId, contact) : null)) : null,
    ])
    return NextResponse.json({ settings, header: quoteStoreOf(ctx.store, settings), today: storeToday(ctx), client })
  } catch (error) {
    return serverError('GET /api/data/quotes/settings', error, 'No se pudieron cargar los ajustes')
  }
}

/** PUT /api/data/quotes/settings — solo administradores. */
export async function PUT(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = validateQuoteSettings(body)
  if (!parsed.ok) return jsonError(parsed.error)
  try {
    const { error } = await getServerSupabase().from('stores').update({ quote_settings: parsed.value }).eq('id', ctx.storeId)
    if (error) throw error
    return NextResponse.json({ settings: parsed.value })
  } catch (error) {
    return serverError('PUT /api/data/quotes/settings', error, 'No se pudieron guardar los ajustes')
  }
}
