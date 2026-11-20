/**
 * Cotizaciones: el modelo que comparten el editor, la hoja (vista previa y
 * página del cliente), el PDF y el servidor. Funciones puras, sin red.
 *
 * Los precios se capturan sin IVA (como en un punto de venta) y los totales se
 * calculan en centavos para que la hoja, el PDF y la base den lo mismo.
 */

import { APP_NAME } from './brand'

/**
 * Pie de toda cotización, en los dos planes (hoja, página del cliente y PDF):
 * la marca de Matices con un enlace que Umami cuenta aparte (utm_source=cotizacion).
 */
export const QUOTE_BRAND = {
  lead: 'Haz crecer tu negocio con ',
  name: `${APP_NAME} CRM`,
  url: 'https://www.matices.app/?utm_source=cotizacion',
} as const

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected'] as const
export type QuoteStatus = typeof QUOTE_STATUSES[number]
/** Lo que se ve: «Vencida» no se guarda, sale de la fecha de validez. */
export type QuoteDisplayStatus = QuoteStatus | 'expired'

export const STATUS_INFO: Record<QuoteDisplayStatus, { label: string; tone: 'muted' | 'info' | 'ok' | 'danger' | 'warn' }> = {
  draft:    { label: 'Borrador',  tone: 'muted' },
  sent:     { label: 'Enviada',   tone: 'info' },
  accepted: { label: 'Aceptada',  tone: 'ok' },
  rejected: { label: 'Rechazada', tone: 'danger' },
  expired:  { label: 'Vencida',   tone: 'warn' },
}

export const TAX_RATES = [16, 8] as const
export const UNIT_SUGGESTIONS = ['pza', 'L', 'galón', 'cubeta', 'kg', 'm²', 'servicio'] as const
export const MAX_ITEMS = 100
export const MAX_TOTAL = 999_999_999

/** Cómo se manda: queda en la cotización y define el tipo de actividad en Comercial. */
export const SEND_VIAS = ['whatsapp', 'correo', 'chat', 'compartir', 'enlace', 'en_persona'] as const
export type SendVia = typeof SEND_VIAS[number]
export const activityKindFor = (via: SendVia | null | undefined): 'whatsapp' | 'correo' | 'visita' =>
  via === 'correo' ? 'correo' : via === 'en_persona' || !via ? 'visita' : 'whatsapp'

export type QuoteItem = { description: string; quantity: number; unit: string; price: number }

export type QuoteSettings = {
  /** Días de validez de una cotización nueva. */
  validDays: number
  /** Condiciones que aparecen al pie (se pueden cambiar en cada cotización). */
  terms: string
  /** Una cotización nueva lleva IVA. */
  taxDefault: boolean
  /** 16 % (general) u 8 % (zona fronteriza). */
  taxRate: 16 | 8
  rfc: string
  legalName: string
}

export const DEFAULT_TERMS = 'Precios en pesos mexicanos. Sujetos a cambio sin previo aviso y a disponibilidad de producto.'

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  validDays: 15, terms: DEFAULT_TERMS, taxDefault: true, taxRate: 16, rfc: '', legalName: '',
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Lo guardado en stores.quote_settings, con los valores por defecto donde falte algo. */
export function parseQuoteSettings(raw: unknown): QuoteSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const days = Number(o.validDays)
  return {
    validDays: Number.isInteger(days) && days >= 1 && days <= 365 ? days : DEFAULT_QUOTE_SETTINGS.validDays,
    terms: typeof o.terms === 'string' ? o.terms.trim().slice(0, 2000) : DEFAULT_QUOTE_SETTINGS.terms,
    taxDefault: typeof o.taxDefault === 'boolean' ? o.taxDefault : DEFAULT_QUOTE_SETTINGS.taxDefault,
    taxRate: o.taxRate === 8 ? 8 : 16,
    rfc: str(o.rfc, 13).toUpperCase(),
    legalName: str(o.legalName, 200),
  }
}

/** Valida los ajustes que manda un administrador. */
export function validateQuoteSettings(raw: unknown): { ok: true; value: QuoteSettings } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Ajustes inválidos' }
  const o = raw as Record<string, unknown>
  const days = Number(o.validDays)
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, error: 'La validez va de 1 a 365 días' }
  if (typeof o.terms !== 'string' || o.terms.length > 2000) return { ok: false, error: 'Las condiciones exceden 2,000 caracteres' }
  if (typeof o.taxDefault !== 'boolean') return { ok: false, error: 'Elige si las cotizaciones llevan IVA' }
  if (o.taxRate !== 16 && o.taxRate !== 8) return { ok: false, error: 'La tasa de IVA es 16 % u 8 %' }
  const rfc = typeof o.rfc === 'string' ? o.rfc.trim().toUpperCase() : ''
  if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc)) return { ok: false, error: 'El RFC no tiene un formato válido' }
  const legalName = typeof o.legalName === 'string' ? o.legalName.trim() : ''
  if (legalName.length > 200) return { ok: false, error: 'La razón social excede 200 caracteres' }
  return { ok: true, value: { validDays: days, terms: o.terms.trim(), taxDefault: o.taxDefault, taxRate: o.taxRate, rfc, legalName } }
}

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.round((n + Number.EPSILON) * f) / f
}

/**
 * Renglones que manda el editor, ya limpios. Acepta renglones a medio llenar
 * (el borrador se guarda mientras se escribe); null si algo es inválido.
 */
export function parseItems(raw: unknown): { ok: true; items: QuoteItem[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'Renglones inválidos' }
  if (raw.length > MAX_ITEMS) return { ok: false, error: `Una cotización lleva hasta ${MAX_ITEMS} renglones` }
  const items: QuoteItem[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') return { ok: false, error: 'Renglón inválido' }
    const o = r as Record<string, unknown>
    const description = typeof o.description === 'string' ? o.description.slice(0, 300) : ''
    const unit = typeof o.unit === 'string' ? o.unit.trim().slice(0, 20) : ''
    const quantity = Number(o.quantity ?? 0)
    const price = Number(o.price ?? 0)
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) return { ok: false, error: 'Revisa la cantidad de los renglones' }
    if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return { ok: false, error: 'Revisa el precio de los renglones' }
    items.push({ description, quantity: round(quantity, 3), unit, price: round(price, 2) })
  }
  return { ok: true, items }
}

/** Un renglón cuenta (hoja, PDF, total) si tiene descripción o importe. */
export const isFilled = (it: QuoteItem) => it.description.trim() !== '' || (it.quantity > 0 && it.price > 0)

/** Importe de un renglón en centavos, con enteros (cantidad en milésimas × precio en centavos). */
const lineCents = (it: Pick<QuoteItem, 'quantity' | 'price'>) =>
  Math.round(Math.round(it.quantity * 1000) * Math.round(it.price * 100) / 1000)
export const lineTotal = (it: Pick<QuoteItem, 'quantity' | 'price'>) => lineCents(it) / 100

export type Totals = { subtotal: number; discount: number; tax: number; total: number }

export function computeTotals(
  items: Pick<QuoteItem, 'quantity' | 'price'>[],
  discountKind: 'percent' | 'amount', discountValue: number, taxRate: number,
): Totals {
  const sub = items.reduce((sum, it) => sum + lineCents(it), 0)
  const value = Math.max(0, Number(discountValue) || 0)
  const disc = Math.min(sub, discountKind === 'percent' ? Math.round(sub * Math.min(value, 100) / 100) : Math.round(value * 100))
  const tax = Math.round((sub - disc) * (Number(taxRate) || 0) / 100)
  return { subtotal: sub / 100, discount: disc / 100, tax: tax / 100, total: (sub - disc + tax) / 100 }
}

export function displayStatus(status: QuoteStatus, validUntil: string, today: string): QuoteDisplayStatus {
  return status === 'sent' && validUntil < today ? 'expired' : status
}

const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** $1,336.03 (siempre con centavos, como en un ticket). */
export const fmtMoney = (n: number | string | null | undefined) => moneyFmt.format(Number(n) || 0).replace('MX$', '$')

const qtyFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 })
export const fmtQty = (n: number) => qtyFmt.format(n)

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** 18 de septiembre de 2026 (fecha AAAA-MM-DD, sin zona). */
export function fmtLongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return y && m && d ? `${d} de ${MONTHS[m - 1]} de ${y}` : ''
}

export const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** #31 (una cotización que aún no se guarda no tiene folio). */
export const folioLabel = (folio: number) => (folio > 0 ? `#${folio}` : 'Nueva')
export const pdfFilename = (folio: number, storeName: string) =>
  `Cotizacion-${folio}-${storeName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tienda'}.pdf`

/** El mensaje que se propone para WhatsApp (el vendedor lo puede cambiar). */
export function whatsappMessage(q: { folio: number; client_name: string; total: number }, storeName: string, link: string): string {
  const first = q.client_name.trim().split(/\s+/)[0]
  return `Hola${first ? ` ${first}` : ''}, te comparto la cotización ${folioLabel(q.folio)} de ${storeName} por ${fmtMoney(q.total)}. Puedes verla y descargarla aquí: ${link}`
}

/** El mensaje que se propone para el correo (va arriba del resumen y el PDF). */
export function emailMessage(q: { client_name: string }, storeName: string): string {
  const first = q.client_name.trim().split(/\s+/)[0]
  return `Hola${first ? ` ${first}` : ''}:\n\nTe envío la cotización que nos pediste. Va adjunta en PDF y también la puedes ver en línea.\n\nQuedo al pendiente de cualquier duda.\n\n${storeName}`
}

/** Dirección pública de la cotización (la clave no se puede adivinar). */
export const quotePublicPath = (token: string) => `/cotizacion/${token}`

/** Lo que la hoja y el PDF necesitan de la tienda. */
export type QuoteStore = {
  name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  logoUrl: string | null
  rfc: string
  legalName: string
}

/** La cotización tal como la dibujan la hoja y el PDF. */
export type QuoteDoc = {
  folio: number
  status: QuoteStatus
  client_name: string
  client_phone: string
  client_email: string
  items: QuoteItem[]
  discount_kind: 'percent' | 'amount'
  discount_value: number
  tax_rate: number
  notes: string
  issued_on: string
  valid_until: string
  seller_name: string | null
}

export function storeAddressLines(s: Pick<QuoteStore, 'address' | 'city' | 'state'>): string[] {
  // «Puebla, Puebla» se dice una vez
  const same = s.city && s.state && s.city.trim().toLowerCase() === s.state.trim().toLowerCase()
  const place = (same ? [s.city] : [s.city, s.state]).filter(Boolean).join(', ')
  return [s.address, place ? `${place}, México` : null].filter((x): x is string => !!x && !!x.trim())
}
