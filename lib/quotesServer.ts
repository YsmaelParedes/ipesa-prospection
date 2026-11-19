/**
 * Cotizaciones (solo servidor): permisos, lectura y lo que necesitan la hoja
 * y el PDF. El vendedor ve y edita las suyas; un administrador, todas.
 */
import { STORE_COLUMNS, getServerSupabase, getUserNameMap, type StoreContext, type StoreRow } from './supabase-server'
import { storeLogoUrl } from './storeServer'
import { effectivePlan } from './stores'
import { todayISO } from './commercial'
import { fmtPhone } from './phone'
import { parseFields, type Schema } from './validation'
import {
  MAX_TOTAL, computeTotals, displayStatus, isFilled, parseItems, parseQuoteSettings,
  type QuoteDoc, type QuoteItem, type QuoteSettings, type QuoteStatus, type QuoteStore, type SendVia,
} from './quotes'

export const QUOTE_COLUMNS =
  'id, store_id, folio, created_by, contact_id, client_name, client_phone, client_email, items, discount_kind, discount_value, ' +
  'tax_rate, notes, issued_on, valid_until, status, subtotal, discount, tax, total, share_token, sent_at, sent_via, viewed_at, ' +
  'decided_at, activity_id, sale_activity_id, created_at, updated_at'

export type QuoteRow = {
  id: string; store_id: string; folio: number; created_by: string | null; contact_id: string | null
  client_name: string; client_phone: string; client_email: string; items: QuoteItem[]
  discount_kind: 'percent' | 'amount'; discount_value: number | string; tax_rate: number | string
  notes: string; issued_on: string; valid_until: string; status: QuoteStatus
  subtotal: number | string; discount: number | string; tax: number | string; total: number | string
  share_token: string; sent_at: string | null; sent_via: SendVia | null; viewed_at: string | null
  decided_at: string | null; activity_id: string | null; sale_activity_id: string | null
  created_at: string; updated_at: string
}

/** Lo que recibe el navegador (sin store_id; con el nombre del vendedor y el estado a mostrar). */
export function quoteToClient(q: QuoteRow, names: Map<string, string>, today: string) {
  const { store_id: _store, ...rest } = q
  return {
    ...rest,
    discount_value: Number(q.discount_value), tax_rate: Number(q.tax_rate),
    subtotal: Number(q.subtotal), discount: Number(q.discount), tax: Number(q.tax), total: Number(q.total),
    seller_name: q.created_by ? names.get(q.created_by) ?? 'Otro usuario' : null,
    display_status: displayStatus(q.status, q.valid_until, today),
  }
}
export type ClientQuote = ReturnType<typeof quoteToClient>

export const storeToday = (ctx: Pick<StoreContext, 'store'>) => todayISO(ctx.store.timezone || undefined)

/** Quién puede ver y cambiar una cotización: quien la hizo o un administrador. */
export const canTouch = (ctx: StoreContext, q: Pick<QuoteRow, 'created_by'>) => ctx.isAdmin || q.created_by === ctx.uid

/** La cotización si existe en la tienda y quien pide puede verla. */
export async function getQuote(ctx: StoreContext, id: string): Promise<QuoteRow | null> {
  const { data, error } = await getServerSupabase().from('quotes').select(QUOTE_COLUMNS)
    .eq('id', id).eq('store_id', ctx.storeId).maybeSingle()
  if (error) throw error
  const q = data as QuoteRow | null
  return q && canTouch(ctx, q) ? q : null
}

export async function getQuoteSettings(storeId: string): Promise<QuoteSettings> {
  const { data, error } = await getServerSupabase().from('stores').select('quote_settings').eq('id', storeId).maybeSingle()
  if (error) throw error
  return parseQuoteSettings(data?.quote_settings)
}

/** Encabezado de la hoja: datos de la tienda, RFC y si lleva el pie de Matices. */
export function quoteStoreOf(store: StoreRow, settings: QuoteSettings): QuoteStore {
  return {
    name: store.name, phone: store.phone, email: store.email,
    address: store.address, city: store.city, state: store.state,
    logoUrl: storeLogoUrl(store.logo_path),
    rfc: settings.rfc, legalName: settings.legalName,
    branded: effectivePlan(store) === 'litro',
  }
}

export function quoteDocOf(q: QuoteRow, sellerName: string | null): QuoteDoc {
  return {
    folio: q.folio, status: q.status,
    client_name: q.client_name, client_phone: q.client_phone, client_email: q.client_email,
    items: Array.isArray(q.items) ? q.items : [],
    discount_kind: q.discount_kind, discount_value: Number(q.discount_value), tax_rate: Number(q.tax_rate),
    notes: q.notes, issued_on: q.issued_on, valid_until: q.valid_until, seller_name: sellerName,
  }
}

export async function sellerNameOf(storeId: string, uid: string | null): Promise<string | null> {
  if (!uid) return null
  const names = await getUserNameMap(storeId).catch(() => new Map<string, string>())
  return names.get(uid) ?? null
}

const QUOTE_SCHEMA: Schema = {
  contact_id:     { type: 'uuid', nullable: true, label: 'Cliente' },
  client_name:    { type: 'text', max: 200, label: 'Nombre del cliente' },
  client_phone:   { type: 'text', max: 30, label: 'Teléfono del cliente', pattern: /^[\d\s()+-]*$/ },
  client_email:   { type: 'text', max: 254, label: 'Correo del cliente', pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  discount_kind:  { type: 'enum', values: ['percent', 'amount'], label: 'Tipo de descuento' },
  discount_value: { type: 'number', min: 0, max: MAX_TOTAL, label: 'Descuento' },
  tax_rate:       { type: 'number', min: 0, max: 16, label: 'IVA' },
  notes:          { type: 'text', max: 2000, label: 'Condiciones' },
  valid_until:    { type: 'date', label: 'Válida hasta' },
}

export type QuoteInput = Partial<Pick<QuoteRow, 'contact_id' | 'client_name' | 'client_phone' | 'client_email' | 'items' | 'discount_kind' | 'notes' | 'valid_until'>>
  & { discount_value?: number; tax_rate?: number }

/** Campos que manda el editor, validados (solo los presentes). */
export function parseQuoteInput(body: Record<string, unknown>): { ok: true; data: QuoteInput } | { ok: false; error: string } {
  const parsed = parseFields(body, QUOTE_SCHEMA, { partial: true })
  if (!parsed.ok) return parsed
  const data = parsed.data as QuoteInput
  if (data.tax_rate !== undefined && ![0, 8, 16].includes(data.tax_rate)) return { ok: false, error: 'El IVA es 16 %, 8 % o sin IVA' }
  if (data.discount_kind === 'percent' && (data.discount_value ?? 0) > 100) return { ok: false, error: 'El descuento no puede pasar de 100 %' }
  if (Object.hasOwn(body, 'items')) {
    const items = parseItems(body.items)
    if (!items.ok) return items
    data.items = items.items
  }
  return { ok: true, data }
}

/** Totales que se guardan, a partir de la cotización ya con los cambios. */
export function totalsFor(q: Pick<QuoteRow, 'items' | 'discount_kind'> & { discount_value: number | string; tax_rate: number | string }) {
  const t = computeTotals(q.items.filter(isFilled), q.discount_kind, Number(q.discount_value), Number(q.tax_rate))
  return t.total > MAX_TOTAL ? null : t
}

/** Lo que copia una cotización del contacto (el negocio, si tiene, va como nombre del cliente). */
export async function clientFromContact(storeId: string, contactId: string) {
  const { data, error } = await getServerSupabase().from('contacts').select('id, name, company, phone, email')
    .eq('id', contactId).eq('store_id', storeId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    contact_id: data.id as string,
    client_name: ((data.company as string | null)?.trim() || (data.name as string)).slice(0, 200),
    client_phone: fmtPhone(data.phone as string | null),
    client_email: (data.email as string | null) ?? '',
  }
}

/** Respuesta con un PDF: para descargar (attachment) o para verlo en el navegador (inline). */
export function pdfResponse(pdf: Buffer, filename: string, inline = false): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

/** Clave de un enlace público: la genera randomToken (base64url). */
export const isShareToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t)

/**
 * Cotización por su enlace público, con su tienda. Un borrador no se muestra
 * (aún no se envía) y tampoco la de una tienda que ya no existe.
 */
export async function getPublicQuote(token: string): Promise<{ quote: QuoteRow; store: StoreRow; settings: QuoteSettings; seller: string | null } | null> {
  if (!isShareToken(token)) return null
  const db = getServerSupabase()
  const { data, error } = await db.from('quotes').select(QUOTE_COLUMNS).eq('share_token', token).neq('status', 'draft').maybeSingle()
  if (error) throw error
  if (!data) return null
  const quote = data as unknown as QuoteRow
  const { data: store, error: storeError } = await db.from('stores').select(`${STORE_COLUMNS}, quote_settings`).eq('id', quote.store_id).maybeSingle()
  if (storeError) throw storeError
  if (!store) return null
  return {
    quote, store: store as unknown as StoreRow,
    settings: parseQuoteSettings((store as { quote_settings?: unknown }).quote_settings),
    seller: await sellerNameOf(quote.store_id, quote.created_by),
  }
}

/** El PDF de una cotización (la librería se carga solo cuando hace falta). */
export async function renderQuotePdf(q: QuoteRow, store: QuoteStore, sellerName: string | null, origin: string): Promise<Buffer> {
  const { renderQuotePdfBuffer } = await import('./quotePdf')
  return renderQuotePdfBuffer(quoteDocOf(q, sellerName), store, origin)
}
