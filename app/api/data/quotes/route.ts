import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getTestUserIds, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { getVisibleContact, zonedDayStart } from '@/lib/commercialServer'
import { randomToken } from '@/lib/crypto'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { addDaysIso } from '@/lib/quotes'
import {
  QUOTE_COLUMNS, clientFromContact, getQuoteSettings, parseQuoteInput, priceListBelongs, quoteToClient, storeToday, totalsFor,
  type QuoteRow,
} from '@/lib/quotesServer'

const LIST_LIMIT = 300
const FILTERS = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const

/**
 * GET /api/data/quotes[?status=&user=&q=&contact=]
 * Las cotizaciones visibles (vendedor: las suyas; administrador: todas o las
 * de una persona), las más recientes primero, y las cifras del mes:
 * cotizado y aceptado (por fecha de envío) y porcentaje de aceptación.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const status = sp.get('status')
  if (status && !(FILTERS as readonly string[]).includes(status)) return jsonError('Estado inválido')
  const user = sp.get('user')
  if (user && !isUUID(user)) return jsonError('Persona inválida')
  const contact = sp.get('contact')
  if (contact && !isUUID(contact)) return jsonError('Cliente inválido')
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const only = ctx.isAdmin ? user : ctx.uid
  const today = storeToday(ctx)
  const tz = ctx.store.timezone || 'America/Mexico_City'
  const monthStart = zonedDayStart(`${today.slice(0, 7)}-01`, tz).toISOString()

  try {
    const db = getServerSupabase()
    let list = db.from('quotes').select(QUOTE_COLUMNS).eq('store_id', ctx.storeId)
    if (only) list = list.eq('created_by', only)
    if (contact) list = list.eq('contact_id', contact)
    if (status === 'expired') list = list.eq('status', 'sent').lt('valid_until', today)
    else if (status === 'sent') list = list.eq('status', 'sent').gte('valid_until', today)
    else if (status) list = list.eq('status', status)
    const folio = /^#?\s*(\d{1,9})$/.exec(q)
    if (folio) list = list.eq('folio', Number(folio[1]))
    else if (q) list = list.ilike('client_name', `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`)

    let month = db.from('quotes').select('status, total, created_by').eq('store_id', ctx.storeId).gte('sent_at', monthStart)
    if (only) month = month.eq('created_by', only)

    const [{ data, error }, monthRes, names, testers] = await Promise.all([
      list.order('created_at', { ascending: false }).limit(LIST_LIMIT),
      contact ? Promise.resolve({ data: [], error: null }) : month,
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
      ctx.isAdmin && !user ? getTestUserIds(ctx.storeId) : Promise.resolve(new Set<string>()),
    ])
    if (error) throw error
    if (monthRes.error) throw monthRes.error

    // Las cuentas de prueba no cuentan en las cifras del equipo
    const sent = ((monthRes.data ?? []) as { status: string; total: number | string; created_by: string | null }[])
      .filter(r => !r.created_by || !testers.has(r.created_by))
    const accepted = sent.filter(r => r.status === 'accepted')
    const stats = {
      quoted: sent.reduce((s, r) => s + Number(r.total), 0),
      accepted: accepted.reduce((s, r) => s + Number(r.total), 0),
      sentCount: sent.length,
      acceptedCount: accepted.length,
    }
    const rows = (data ?? []) as unknown as QuoteRow[]
    return NextResponse.json({
      quotes: rows.map(r => quoteToClient(r, names, today)),
      truncated: rows.length === LIST_LIMIT,
      stats,
      today,
    })
  } catch (error) {
    return serverError('GET /api/data/quotes', error, 'Error al obtener las cotizaciones')
  }
}

/**
 * POST /api/data/quotes — crea una cotización (borrador) con su folio. Con
 * contact_id copia los datos del contacto; validez, IVA y condiciones salen
 * de los ajustes de la tienda si no vienen.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseQuoteInput(body)
  if (!parsed.ok) return jsonError(parsed.error)
  const input = parsed.data

  try {
    const db = getServerSupabase()
    const settings = await getQuoteSettings(ctx.storeId)
    const today = storeToday(ctx)
    let client = { contact_id: null as string | null, client_name: '', client_phone: '', client_email: '' }
    if (input.contact_id) {
      if (!(await getVisibleContact(ctx, input.contact_id))) return jsonError('Cliente no encontrado', 404)
      client = (await clientFromContact(ctx.storeId, input.contact_id)) ?? client
    }
    if (input.price_list_id && !(await priceListBelongs(ctx.storeId, input.price_list_id))) return jsonError('Esa lista de precios ya no existe', 404)
    const row = {
      ...client,
      ...Object.fromEntries(Object.entries({
        client_name: input.client_name, client_phone: input.client_phone, client_email: input.client_email,
      }).filter(([, v]) => v !== undefined && v !== '')),
      items: input.items ?? [],
      discount_kind: input.discount_kind ?? 'percent',
      discount_value: input.discount_value ?? 0,
      tax_rate: input.tax_rate ?? (settings.taxDefault ? settings.taxRate : 0),
      notes: input.notes ?? settings.terms,
      issued_on: today,
      valid_until: input.valid_until && input.valid_until >= today ? input.valid_until : addDaysIso(today, settings.validDays),
      price_list_id: input.price_list_id ?? null,
    }
    const totals = totalsFor(row)
    if (!totals) return jsonError('El total es demasiado grande')

    const { data: folio, error: folioError } = await db.rpc('next_quote_folio', { p_store: ctx.storeId })
    if (folioError) throw folioError
    const { data, error } = await db.from('quotes').insert([{
      ...row, ...totals, store_id: ctx.storeId, folio, created_by: ctx.uid, share_token: randomToken(16),
    }]).select(QUOTE_COLUMNS).single()
    if (error) throw error
    const names = await getUserNameMap(ctx.storeId).catch(() => new Map<string, string>())
    return NextResponse.json({ quote: quoteToClient(data as unknown as QuoteRow, names, today) })
  } catch (error) {
    return serverError('POST /api/data/quotes', error, 'No se pudo crear la cotización')
  }
}
