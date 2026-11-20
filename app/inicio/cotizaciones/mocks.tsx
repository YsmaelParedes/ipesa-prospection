import { CheckCheck } from 'lucide-react'
import { computeTotals, whatsappMessage } from '@/lib/quotes'
import { Ic } from '../_ui'
import { SAMPLE_CLIENT, SAMPLE_DISCOUNT, SAMPLE_FOLIO, SAMPLE_ITEMS, SAMPLE_STORE } from '../demos/quoteSample'
import s from '../inicio.module.css'

/* Vistas de ejemplo de Cotizaciones (sin estado): la lista con sus estados y el mensaje de WhatsApp. */

const SAMPLE_TOTAL = computeTotals(SAMPLE_ITEMS, 'percent', SAMPLE_DISCOUNT, 16).total
const whole = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

const LIST = [
  { folio: SAMPLE_FOLIO, name: SAMPLE_CLIENT.name, sub: 'Luis Herrera · Vista', amount: SAMPLE_TOTAL, status: 'Enviada', tone: s.qsSent },
  { folio: 127, name: 'Hotel Sol', sub: 'Sofía Ramos · Sin abrir', amount: 18700, status: 'Enviada', tone: s.qsSent },
  { folio: 126, name: 'Karen López', sub: 'Luis Herrera', amount: 4850, status: 'Aceptada', tone: s.qsOk },
  { folio: 125, name: 'Ferretería Arce', sub: 'Sofía Ramos', amount: 17005, status: 'Vencida', tone: s.qsWarn },
]

/** La lista de Cotizaciones del administrador: folio, cliente, vendedor, monto y estado. */
export function QuoteListMock() {
  const quoted = LIST.reduce((sum, q) => sum + Math.round(q.amount), 0)
  return (
    <div className={s.mock} aria-hidden="true">
      <div className={s.mockHead}><strong>Cotizaciones</strong><small>{whole(quoted)} cotizado este mes</small></div>
      {LIST.map(q => (
        <div key={q.folio} className={s.mockRow}>
          <span className={s.qFolio}>#{q.folio}</span>
          <span className={s.rowName}>{q.name}<small>{q.sub}</small></span>
          <strong className={s.qAmount}>{whole(q.amount)}</strong>
          <em className={`${s.mockTag} ${q.tone}`}>{q.status}</em>
        </div>
      ))}
    </div>
  )
}

/** El chat de WhatsApp con el mensaje que propone Matices al enviar. */
export function QuoteWhatsAppMock() {
  const message = whatsappMessage({ folio: SAMPLE_FOLIO, client_name: SAMPLE_CLIENT.name, total: SAMPLE_TOTAL }, SAMPLE_STORE.name, 'matices.app/cotizacion/…')
  return (
    <div className={s.waQuote} aria-hidden="true">
      <div className={s.waChat}>
        <div className={s.waChatHead}><strong>{SAMPLE_CLIENT.name}</strong><span className={s.waLinked}><Ic.quote />Cotización #{SAMPLE_FOLIO}</span></div>
        <p className={s.msgIn}>Buen día, ¿me pasas precio de 4 cubetas de vinílica blanca y 2 de sellador?</p>
        <p className={s.msgOut}>{message}<span className={s.ticks}><CheckCheck size={14} aria-hidden="true" /></span></p>
        <p className={s.msgIn}>Gracias, la reviso con el ingeniero y te confirmo.</p>
      </div>
    </div>
  )
}
