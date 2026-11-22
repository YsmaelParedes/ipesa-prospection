import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { randomToken } from '@/lib/crypto'
import { isUUID, jsonError, serverError } from '@/lib/validation'
import { addDaysIso } from '@/lib/quotes'
import { QUOTE_COLUMNS, getQuote, getQuoteSettings, quoteToClient, storeToday, totalsFor, type QuoteRow } from '@/lib/quotesServer'

type Ctx = { params: Promise<{ id: string }> }

/** POST /api/data/quotes/[id]/duplicate — una cotización nueva (borrador, folio nuevo) con lo mismo. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    if (q.file_path) return jsonError('Una cotización subida no se puede duplicar', 409)
    const db = getServerSupabase()
    const [settings, folioRes] = await Promise.all([getQuoteSettings(ctx.storeId), db.rpc('next_quote_folio', { p_store: ctx.storeId })])
    if (folioRes.error) throw folioRes.error
    const today = storeToday(ctx)
    const row = {
      contact_id: q.contact_id, client_name: q.client_name, client_phone: q.client_phone, client_email: q.client_email,
      items: q.items, discount_kind: q.discount_kind, discount_value: q.discount_value, tax_rate: q.tax_rate, notes: q.notes,
      price_list_id: q.price_list_id,
    }
    const { data, error } = await db.from('quotes').insert([{
      ...row, ...totalsFor(row), store_id: ctx.storeId, folio: folioRes.data, created_by: ctx.uid,
      issued_on: today, valid_until: addDaysIso(today, settings.validDays), share_token: randomToken(16),
    }]).select(QUOTE_COLUMNS).single()
    if (error) throw error
    const names = await getUserNameMap(ctx.storeId).catch(() => new Map<string, string>())
    return NextResponse.json({ quote: quoteToClient(data as unknown as QuoteRow, names, today) })
  } catch (error) {
    return serverError('POST /api/data/quotes/[id]/duplicate', error, 'No se pudo duplicar la cotización')
  }
}
