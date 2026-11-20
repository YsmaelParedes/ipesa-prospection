'use client'

import { useState, useSyncExternalStore } from 'react'
import { Check, MessageCircle, Plus, RotateCcw, X } from 'lucide-react'
import { QuoteSheet } from '@/components/QuoteSheet'
import {
  addDaysIso, computeTotals, fmtMoney, isFilled, lineTotal, whatsappMessage, type QuoteDoc, type QuoteItem,
} from '@/lib/quotes'
import { todayISO } from '@/lib/commercial'
import {
  SAMPLE_CLIENT, SAMPLE_DISCOUNT, SAMPLE_FOLIO, SAMPLE_ITEMS, SAMPLE_SELLER, SAMPLE_STORE, SAMPLE_SUGGESTIONS, SAMPLE_TERMS,
} from './quoteSample'
import { demoUsed, useToast } from './shared'
import s from './demos.module.css'

/**
 * Demo de Cotizaciones: a la izquierda los productos (como el editor de la
 * app) y a la derecha la misma hoja que recibe el cliente (components/QuoteSheet),
 * que cambia al escribir. «Enviar» muestra el mensaje de WhatsApp y el
 * seguimiento; nada se guarda ni se envía.
 */

type Row = { id: number; description: string; quantity: string; unit: string; price: string }
const toRow = (it: QuoteItem, id: number): Row => ({ id, description: it.description, quantity: String(it.quantity), unit: it.unit, price: String(it.price) })
const START_ROWS = SAMPLE_ITEMS.map(toRow)
const DISCOUNTS = [0, 5, 10]
const num = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// La fecha solo en el navegador: la página es estática y no debe quedarse con la del día en que se publicó
const noSubscribe = () => () => {}
const useToday = () => useSyncExternalStore(noSubscribe, () => todayISO(), () => '')

/** La demo dentro de su tarjeta, a todo lo ancho (el editor y la hoja van lado a lado). */
export function QuoteDemoStage() {
  return (
    <div className={s.stage} onPointerDownCapture={() => demoUsed('quote')} onKeyDownCapture={() => demoUsed('quote')}>
      <QuoteDemo />
    </div>
  )
}

function QuoteDemo() {
  const today = useToday()
  const [client, setClient] = useState(SAMPLE_CLIENT.name)
  const [rows, setRows] = useState<Row[]>(START_ROWS)
  const [discount, setDiscount] = useState(SAMPLE_DISCOUNT)
  const [withTax, setWithTax] = useState(true)
  const [sent, setSent] = useState(false)
  const toast = useToast()

  const items: QuoteItem[] = rows.map(r => ({ description: r.description, quantity: num(r.quantity), unit: r.unit, price: num(r.price) }))
  const taxRate = withTax ? 16 : 0
  const total = computeTotals(items.filter(isFilled), 'percent', discount, taxRate).total
  const ready = client.trim() !== '' && total > 0
  const suggestions = SAMPLE_SUGGESTIONS.filter(sg => !rows.some(r => r.description === sg.description))
  const doc: QuoteDoc = {
    folio: SAMPLE_FOLIO, status: sent ? 'sent' : 'draft',
    client_name: client, client_phone: SAMPLE_CLIENT.phone, client_email: '',
    items, discount_kind: 'percent', discount_value: discount, tax_rate: taxRate, notes: SAMPLE_TERMS,
    issued_on: today, valid_until: today ? addDaysIso(today, 15) : '', seller_name: SAMPLE_SELLER,
  }

  const edit = (id: number, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: number) => setRows(rs => rs.filter(r => r.id !== id))
  const add = (it: QuoteItem) => {
    setRows(rs => [...rs, toRow(it, Math.max(0, ...rs.map(r => r.id)) + 1)])
    toast.show(`${it.description} · ${fmtMoney(it.price)}, tu último precio`)
  }
  const send = () => { setSent(true); toast.show('Se abre WhatsApp con el mensaje listo') }
  const reset = () => {
    setClient(SAMPLE_CLIENT.name); setRows(START_ROWS); setDiscount(SAMPLE_DISCOUNT); setWithTax(true); setSent(false)
  }
  const firstName = client.trim().split(/\s+/)[0]

  return (
    <div className={s.quote} data-demo="quote">
      {toast.node}
      <div>
        <label className={s.qField}>
          <span className={s.qLabel}>Cliente</span>
          <input className={s.qInput} value={client} onChange={e => setClient(e.target.value)} placeholder="Nombre del cliente" autoComplete="off" />
        </label>

        <p className={s.qLabel}>Productos</p>
        <div className={s.card}>
          {rows.map((r, i) => {
            const name = r.description.trim() || `producto ${i + 1}`
            return (
              <div key={r.id} className={s.qItem} data-demo-item={r.id}>
                <div className={s.qItemTop}>
                  <input className={s.qInput} value={r.description} onChange={e => edit(r.id, { description: e.target.value })} placeholder="Descripción" aria-label={`Descripción del producto ${i + 1}`} autoComplete="off" />
                  <button type="button" className={`${s.qRemove} ${s.press}`} onClick={() => remove(r.id)} aria-label={`Quitar ${name}`}><X aria-hidden="true" /></button>
                </div>
                <div className={s.qNums}>
                  <label className={s.qNum}>
                    <span>Cantidad</span>
                    <span className={s.qWith}>
                      <input value={r.quantity} onChange={e => edit(r.id, { quantity: e.target.value })} inputMode="decimal" autoComplete="off" />
                      <em>{r.unit}</em>
                    </span>
                  </label>
                  <label className={s.qNum}>
                    <span>Precio</span>
                    <span className={s.qWith}>
                      <em>$</em>
                      <input value={r.price} onChange={e => edit(r.id, { price: e.target.value })} inputMode="decimal" autoComplete="off" />
                    </span>
                  </label>
                  <span className={s.qLine}><small>Subtotal</small>{fmtMoney(lineTotal({ quantity: num(r.quantity), price: num(r.price) }))}</span>
                </div>
              </div>
            )
          })}
          {rows.length === 0 && <p className={s.qEmpty}>Agrega un producto de los de abajo.</p>}
        </div>

        {suggestions.length > 0 && (
          <>
            <p className={s.qHint}>Ya los cotizaste antes: se agregan con tu último precio.</p>
            <div className={s.chips}>
              {suggestions.map(sg => (
                <button key={sg.description} type="button" className={`${s.qAdd} ${s.press}`} onClick={() => add(sg)} data-demo-add={sg.description}>
                  <Plus aria-hidden="true" />{sg.description}<small>{fmtMoney(sg.price)}</small>
                </button>
              ))}
            </div>
          </>
        )}

        <div className={s.qOptions}>
          <div>
            <p className={s.qLabel}>Descuento</p>
            <div className={s.chips}>
              {DISCOUNTS.map(d => (
                <button key={d} type="button" className={`${s.chip} ${s.press}`} aria-pressed={discount === d} onClick={() => setDiscount(d)}>{d ? `${d} %` : 'Sin descuento'}</button>
              ))}
            </div>
          </div>
          <div>
            <p className={s.qLabel}>IVA</p>
            <div className={s.chips}>
              <button type="button" className={`${s.chip} ${s.press}`} aria-pressed={withTax} onClick={() => setWithTax(true)}>16 %</button>
              <button type="button" className={`${s.chip} ${s.press}`} aria-pressed={!withTax} onClick={() => setWithTax(false)}>Sin IVA</button>
            </div>
          </div>
        </div>

        {sent ? (
          <div className={s.qSent} aria-live="polite">
            <p className={s.qBubble}>{whatsappMessage({ folio: SAMPLE_FOLIO, client_name: client, total }, SAMPLE_STORE.name, 'matices.app/cotizacion/…')}</p>
            <p className={s.qNext}><Check aria-hidden="true" />{client.trim() || 'El cliente'} pasa a Oportunidades por {fmtMoney(total)}</p>
            <p className={s.qNext}><Check aria-hidden="true" />Te recordamos llamarle{firstName ? ` a ${firstName}` : ''} en 2 días</p>
            <button type="button" className={`${s.qAdd} ${s.press}`} onClick={reset}><RotateCcw aria-hidden="true" />Volver a empezar</button>
          </div>
        ) : (
          <>
            <button type="button" className={`${s.primary} ${s.qSend} ${s.press}`} disabled={!ready} onClick={send} data-demo-send>
              <MessageCircle aria-hidden="true" />Enviar por WhatsApp · {fmtMoney(total)}
            </button>
            {!ready && <p className={s.hint}>Escribe el nombre del cliente y al menos un producto con precio.</p>}
          </>
        )}
      </div>

      <div className={s.qPaper}>
        <QuoteSheet doc={doc} store={SAMPLE_STORE} className={s.qSheet} />
      </div>
    </div>
  )
}
