import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Download, FileText, Mail, MessageCircle, Phone } from 'lucide-react'
import { getMemberships, getSessionUser } from '@/lib/supabase-server'
import { getPublicQuote, quoteDocOf, quoteStoreOf } from '@/lib/quotesServer'
import { clientQuoteName, fmtLongDate, fmtMoney } from '@/lib/quotes'
import { isImageFile } from '@/lib/quoteFiles'
import { todayISO } from '@/lib/commercial'
import { normalizePhone, waMeLink } from '@/lib/phone'
import { QuoteSheet } from '@/components/QuoteSheet'
import { ViewBeacon } from './ViewBeacon'
import s from './public.module.css'

type Props = { params: Promise<{ token: string }> }

/** Una sola consulta por visita (la usan los metadatos y la página). */
const loadQuote = cache(getPublicQuote)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const found = await loadQuote(token).catch(() => null)
  const robots = { index: false, follow: false }
  if (!found) return { title: 'Cotización', robots, referrer: 'no-referrer' }
  const { quote, store } = found
  const header = quoteStoreOf(store, found.settings)
  const title = `${clientQuoteName(quote.folio)} · ${store.name}`
  const description = `Total ${fmtMoney(quote.total)} · válida hasta el ${fmtLongDate(quote.valid_until)}`
  return {
    title, description, robots, referrer: 'no-referrer',
    openGraph: { type: 'website', title, description, siteName: store.name, images: header.logoUrl ? [header.logoUrl] : [] },
    twitter: { card: 'summary', title, description },
  }
}

/**
 * La cotización que abre el cliente con su enlace (sin sesión): la hoja, el
 * PDF y cómo contactar a la tienda. Si la abre alguien de la tienda, no
 * cuenta como «vista por el cliente».
 */
export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params
  const found = await loadQuote(token)
  if (!found) notFound()
  const { quote, store, settings, seller } = found
  const header = quoteStoreOf(store, settings)
  const today = todayISO(store.timezone || undefined)
  const expired = quote.status === 'sent' && quote.valid_until < today

  const user = await getSessionUser()
  const fromStore = !!user && (await getMemberships(user.id).catch(() => [])).some(m => m.storeId === store.id)

  const phone = normalizePhone(store.phone)
  const pdfUrl = `/api/public/quotes/${token}/pdf`
  const name = clientQuoteName(quote.folio)
  const image = !!quote.file_mime && isImageFile(quote.file_mime)

  return (
    <div className={s.wrap}>
      <header className={s.bar}>
        <div className={s.barInner}>
          <div className={s.brand}>
            <strong>{store.name}</strong>
            <span>{name} · {fmtMoney(quote.total)}</span>
          </div>
          <a href={pdfUrl} className={`btn btn-dark ${s.download}`} download>
            <Download aria-hidden="true" /> {quote.file_path && image ? 'Descargar' : 'Descargar PDF'}
          </a>
        </div>
      </header>

      <main className={s.main}>
        {expired && (
          <p className={s.notice} role="status">
            Esta cotización venció el {fmtLongDate(quote.valid_until)}. Los precios pueden haber cambiado: pide una actualizada a {store.name}.
          </p>
        )}
        {quote.status === 'accepted' && <p className={`${s.notice} ${s.ok}`} role="status">Esta cotización ya fue aceptada. ¡Gracias por tu compra!</p>}

        {!quote.file_path ? (
          <div className={s.paper}>
            <QuoteSheet doc={quoteDocOf(quote, seller)} store={header} />
          </div>
        ) : image ? (
          // La foto de la cotización (la dirección firmada la da la ruta del PDF)
          <div className={s.paper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${pdfUrl}?inline=1`} alt={`${name} de ${store.name}`} className={s.photo} />
          </div>
        ) : (
          <div className={s.fileCard}>
            <FileText aria-hidden="true" />
            <div>
              <strong>{name} de {store.name}</strong>
              <span>Total {fmtMoney(quote.total)} · válida hasta el {fmtLongDate(quote.valid_until)}</span>
            </div>
            <a href={`${pdfUrl}?inline=1`} className="btn btn-primary" target="_blank" rel="noopener noreferrer">Ver cotización</a>
          </div>
        )}

        {(store.phone || store.email) && (
          <section className={s.contact} aria-label={`Contactar a ${store.name}`}>
            <p>¿Tienes dudas o quieres hacer tu pedido? Contacta a <b>{store.name}</b>.</p>
            <div className={s.contactActions}>
              {phone.length === 10 && <a className="btn btn-ghost" href={`${waMeLink(phone)}?text=${encodeURIComponent(`Hola, tengo una pregunta sobre la ${name.toLowerCase()} por ${fmtMoney(quote.total)}.`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" /> WhatsApp</a>}
              {store.phone && <a className="btn btn-ghost" href={`tel:${phone || store.phone}`}><Phone aria-hidden="true" /> Llamar</a>}
              {store.email && <a className="btn btn-ghost" href={`mailto:${store.email}?subject=${encodeURIComponent(name)}`}><Mail aria-hidden="true" /> Correo</a>}
            </div>
          </section>
        )}
      </main>

      {!fromStore && <ViewBeacon token={token} />}
    </div>
  )
}
