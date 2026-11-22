'use client'

import { STATUS_INFO, type QuoteDisplayStatus, type QuoteItem, type QuoteStatus, type SendVia } from '@/lib/quotes'
import s from './cotizaciones.module.css'

/** Una cotización como la manda la API (lib/quotesServer quoteToClient). */
export type Quote = {
  /** Sin folio: es una cotización subida (PDF o foto de otro sistema). */
  id: string; folio: number | null; created_by: string | null; contact_id: string | null
  client_name: string; client_phone: string; client_email: string; items: QuoteItem[]
  discount_kind: 'percent' | 'amount'; discount_value: number; tax_rate: number
  notes: string; issued_on: string; valid_until: string; status: QuoteStatus
  subtotal: number; discount: number; tax: number; total: number
  share_token: string; sent_at: string | null; sent_via: SendVia | null; viewed_at: string | null
  decided_at: string | null; activity_id: string | null; sale_activity_id: string | null
  created_at: string; updated_at: string
  seller_name: string | null; display_status: QuoteDisplayStatus
  file: { name: string; mime: string; size: number } | null
  /** Lista de precios de los renglones del catálogo (null = la principal). */
  price_list_id: string | null
}

export function StatusBadge({ status }: { status: QuoteDisplayStatus }) {
  const info = STATUS_INFO[status]
  return <span className={`${s.status} ${s[`tone-${info.tone}`]}`}><i aria-hidden="true" />{info.label}</span>
}

const SHORT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
/** 17 nov (fecha AAAA-MM-DD sin zona). */
export const shortDay = (iso: string) => SHORT.format(new Date(`${iso.slice(0, 10)}T12:00:00`)).replace('.', '')

const VIEWED = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
/** «17 nov, 14:32» en la hora del navegador. */
export const viewedAt = (iso: string) => VIEWED.format(new Date(iso)).replace('.', '')
