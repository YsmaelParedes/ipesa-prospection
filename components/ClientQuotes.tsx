'use client'

import Link from 'next/link'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { STATUS_INFO, fmtMoney, folioLabel, type QuoteDisplayStatus } from '@/lib/quotes'
import { Loading, SkText, skRows } from '@/components/Skeleton'
import s from './ClientQuotes.module.css'

export type ClientQuote = { id: string; folio: number; total: number; issued_on: string; display_status: QuoteDisplayStatus; activity_id: string | null }

const SHORT = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const day = (iso: string) => SHORT.format(new Date(`${iso.slice(0, 10)}T12:00:00`)).replace('.', '')

/** Las cotizaciones de un contacto (las que puede ver quien usa la app). */
export function useClientQuotes(contactId: string) {
  const { data } = useCachedQuery<{ quotes: ClientQuote[] }>(`/api/data/quotes?contact=${contactId}`)
  return data?.quotes
}

export const newQuoteHref = (contactId: string) => `/cotizaciones/nueva?contact=${contactId}`

/** Lista corta para la ficha del cliente (Comercial y Contactos). */
export function ClientQuotesList({ quotes, limit = 5 }: { quotes: ClientQuote[] | undefined; limit?: number }) {
  if (!quotes) {
    return <Loading label="Cargando cotizaciones…" className={s.list}>{skRows(2, i => <div key={i} className={s.row}><SkText w={90} /><SkText w={70} /></div>)}</Loading>
  }
  if (!quotes.length) return <p className={s.empty}>Todavía no hay cotizaciones para este cliente.</p>
  return (
    <div className={s.list}>
      {quotes.slice(0, limit).map(q => {
        const info = STATUS_INFO[q.display_status]
        return (
          <Link key={q.id} href={`/cotizaciones/${q.id}`} className={s.row}>
            <span className={s.main}><b>{folioLabel(q.folio)}</b> · {day(q.issued_on)}</span>
            <span className={s.side}>
              <span className={s.amount}>{fmtMoney(q.total)}</span>
              <span className={`${s.status} ${s[info.tone]}`}>{info.label}</span>
            </span>
          </Link>
        )
      })}
      {quotes.length > limit && <Link href="/cotizaciones" className={s.more}>Ver todas en Cotizaciones</Link>}
    </div>
  )
}
