/**
 * La hoja de una cotización en HTML: vista previa del editor y página que
 * abre el cliente. Dibuja lo mismo que el PDF (lib/quotePdf.tsx): tamaño
 * carta, medidas en puntos que escalan con el ancho (si cambias uno, cambia
 * el otro). En un espacio angosto (celular) se acomoda en una columna.
 */
import {
  computeTotals, fmtLongDate, fmtMoney, fmtQty, folioLabel, isFilled, lineTotal, storeAddressLines,
  type QuoteDoc, type QuoteStore,
} from '@/lib/quotes'
import { APP_NAME } from '@/lib/brand'
import s from './QuoteSheet.module.css'

export function QuoteSheet({ doc, store, className }: { doc: QuoteDoc; store: QuoteStore; className?: string }) {
  const items = doc.items.filter(isFilled)
  const t = computeTotals(items, doc.discount_kind, doc.discount_value, doc.tax_rate)
  const discountLabel = doc.discount_kind === 'percent' && doc.discount_value > 0 ? `Descuento (${fmtQty(doc.discount_value)} %)` : 'Descuento'
  const contact = [store.email, store.phone].filter(Boolean) as string[]

  return (
    <div className={`${s.frame} ${className ?? ''}`}>
      <article className={s.page} aria-label={`Cotización ${folioLabel(doc.folio)}`}>
        <header className={s.top}>
          <div className={s.topLeft}>
            {/* Sin logo queda vacío: el nombre ya va abajo, con los datos de la tienda */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {store.logoUrl && <img src={store.logoUrl} alt={store.name} className={s.logo} />}
          </div>
          <div className={s.band}>
            <span className={s.title}>Cotización</span>
            {doc.status === 'draft' && <span className={s.draft}>Borrador</span>}
          </div>
        </header>

        <section className={s.parties}>
          <div className={s.storeCol}>
            <h2 className={s.storeName}>{store.name}</h2>
            {store.legalName && <p>{store.legalName}</p>}
            {store.rfc && <p>RFC: {store.rfc}</p>}
            {storeAddressLines(store).map(l => <p key={l}>{l}</p>)}
            {contact.map(l => <p key={l}>{l}</p>)}
          </div>
          <div className={s.clientCol}>
            <p className={s.label}>Cliente</p>
            <p className={s.clientName}>{doc.client_name.trim() || <span className={s.placeholder}>Nombre del cliente</span>}</p>
            {doc.client_phone && <p>{doc.client_phone}</p>}
            {doc.client_email && <p>{doc.client_email}</p>}
          </div>
        </section>

        <dl className={s.meta}>
          <div><dt>Cotización:</dt><dd>{folioLabel(doc.folio)}</dd></div>
          <div><dt>Fecha:</dt><dd>{fmtLongDate(doc.issued_on)}</dd></div>
          <div><dt>Válida hasta:</dt><dd>{fmtLongDate(doc.valid_until)}</dd></div>
          {doc.seller_name && <div><dt>Atendió:</dt><dd>{doc.seller_name}</dd></div>}
        </dl>

        <div className={s.table} role="table" aria-label="Productos">
          <div className={s.th} role="row">
            <span role="columnheader" className={s.cDesc}>Producto</span>
            <span role="columnheader" className={s.cQty}>Cantidad</span>
            <span role="columnheader" className={s.cPrice}>Precio unitario</span>
            <span role="columnheader" className={s.cSub}>Subtotal</span>
          </div>
          {items.length === 0 ? (
            <div className={s.emptyRow} role="row"><span role="cell">Agrega productos para verlos aquí</span></div>
          ) : items.map((it, i) => (
            <div key={i} className={s.tr} role="row">
              <span role="cell" className={s.cDesc}>{it.description || '—'}</span>
              <span role="cell" className={s.cQty}>{fmtQty(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</span>
              <span role="cell" className={s.cPrice}><span className={s.x}>× </span>{fmtMoney(it.price)}</span>
              <span role="cell" className={s.cSub}>{fmtMoney(lineTotal(it))}</span>
            </div>
          ))}
        </div>

        <div className={s.totals}>
          <div><span>Subtotal</span><span>{fmtMoney(t.subtotal)}</span></div>
          <div><span>{discountLabel}</span><span>{t.discount > 0 ? `-${fmtMoney(t.discount)}` : fmtMoney(0)}</span></div>
          {doc.tax_rate > 0 && <div><span>IVA {fmtQty(doc.tax_rate)} %</span><span>{fmtMoney(t.tax)}</span></div>}
          <div className={s.total}><span>Total</span><span>{fmtMoney(t.total)}</span></div>
          {doc.tax_rate === 0 && <p className={s.noTax}>Precios sin IVA</p>}
        </div>

        {doc.notes.trim() && (
          <section className={s.notes}>
            <h3>Condiciones</h3>
            <p>{doc.notes.trim()}</p>
          </section>
        )}

        {store.branded && <footer className={s.foot}>Hecha con {APP_NAME} · matices.app</footer>}
      </article>
    </div>
  )
}
