'use client'

import { apiFetch } from '@/lib/apiClient'


import { useState } from 'react'
import Link from 'next/link'
import {
  MAX_PAYMENT_MONTHS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, fmtMoney, isMoney, paidUntilAfter, todayISO,
  type PaymentMethod, type StorePayment,
} from '@/lib/payments'
import { fmtDate, type PlatformStore } from './data'
import { Select } from '@/components/Select'
import s from './admin.module.css'

/**
 * Pagos en el panel del dueño: formulario "Registrar pago" (ficha de la
 * tienda), renglón de pago y "Anular" (ficha y pantalla Pagos).
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const round2 = (n: number) => Math.round(n * 100) / 100
const MONTH_OPTIONS = [1, 2, 3, 4, 6, 12, 24, 36].filter(m => m <= MAX_PAYMENT_MONTHS)

/** "2026-10-14" → "14 oct 2026" (fecha sin hora: se lee como día local) */
export const fmtDay = (day: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', o)

async function postJson(url: string, body: unknown) {
  const r = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar')
  return d
}

/* ── Registrar pago ─────────────────────────────────────────────────────── */
export function PaymentForm({ store, onDone }: { store: PlatformStore; onDone: (message: string) => Promise<void> | void }) {
  const price = store.monthly_price
  const defaultAmount = (m: number) => (price === null ? '' : String(round2(price * m)))

  const [months, setMonths]   = useState(1)
  const [amount, setAmount]   = useState(defaultAmount(1))
  const [touched, setTouched] = useState(false)   // el monto lo escribió el dueño: ya no se recalcula
  const [method, setMethod]   = useState<PaymentMethod>('transferencia')
  const [paidOn, setPaidOn]   = useState(todayISO())
  const [invoice, setInvoice] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  const changeMonths = (m: number) => {
    setMonths(m)
    if (!touched && method !== 'cortesia') setAmount(defaultAmount(m))
  }
  const changeMethod = (m: PaymentMethod) => {
    setMethod(m)
    if (m === 'cortesia') { setAmount('0'); setTouched(true) }
  }

  const until = paidUntilAfter(store.paid_until, months)
  const unlimited = store.status === 'active' && !store.paid_until

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = amount.trim() === '' ? NaN : Number(amount)
    if (!isMoney(value)) { setError('Escribe el monto recibido (0 si es cortesía), con máximo 2 decimales.'); return }
    setBusy(true)
    setError('')
    try {
      await postJson(`/api/platform/stores/${store.id}/payments`, {
        amount: value, months, method, paidOn, invoiceRequested: invoice, invoiceNumber: invoice ? invoiceNumber : '', notes,
      })
      setInvoice(false); setInvoiceNumber(''); setNotes(''); setTouched(false); setMethod('transferencia')
      setMonths(1); setAmount(defaultAmount(1))
      await onDone(`Pago registrado: ${fmtMoney(value)}. Pagada hasta el ${fmtDate(until.toISOString())}.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={s.block} onSubmit={submit}>
      <div className={s.blockHead}>
        <strong>Registrar pago</strong>
        <small>{price === null ? 'Sin precio acordado' : `Precio acordado: ${fmtMoney(price)} al mes`}</small>
      </div>
      <div className={s.formGrid}>
        <div className="field">
          <label htmlFor="pay-amount">Monto (MXN)</label>
          <input id="pay-amount" inputMode="decimal" value={amount} placeholder="0.00"
            onChange={e => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setTouched(true) }} />
        </div>
        <div className="field">
          <label htmlFor="pay-months">Meses que cubre</label>
          <Select id="pay-months" value={String(months)} onChange={v => changeMonths(Number(v))}
            options={MONTH_OPTIONS.map(m => ({ value: String(m), label: `${m} ${m === 1 ? 'mes' : 'meses'}` }))} />
        </div>
        <div className="field">
          <label htmlFor="pay-method">Método</label>
          <Select id="pay-method" value={method} onChange={v => changeMethod(v as PaymentMethod)}
            options={PAYMENT_METHODS.map(m => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
        </div>
        <div className="field">
          <label htmlFor="pay-date">Fecha del pago</label>
          <input id="pay-date" type="date" value={paidOn} max={todayISO()} onChange={e => setPaidOn(e.target.value)} />
        </div>
      </div>
      <label className={s.check}>
        <input type="checkbox" checked={invoice} onChange={e => setInvoice(e.target.checked)} />
        Pidió factura
      </label>
      {invoice && (
        <div className="field">
          <label htmlFor="pay-invoice">Número de factura (opcional)</label>
          <input id="pay-invoice" value={invoiceNumber} maxLength={60} onChange={e => setInvoiceNumber(e.target.value)} placeholder="A-102" />
        </div>
      )}
      <div className="field">
        <label htmlFor="pay-notes">Nota (opcional)</label>
        <input id="pay-notes" value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} placeholder="Referencia de la transferencia, quién pagó…" />
      </div>
      <div className={s.preview}>
        Quedará pagada hasta el <strong>{fmtDate(until.toISOString())}</strong>.
        {unlimited && ' Hoy no tiene vencimiento: con este pago tendrá fecha de vencimiento.'}
      </div>
      {error && <div className={cx(s.msg, s.msgErr)} role="alert">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
        {busy ? 'Registrando…' : 'Registrar pago'}
      </button>
    </form>
  )
}

/* ── Anular ─────────────────────────────────────────────────────────────── */
export function VoidControl({ payment, onVoided }: { payment: StorePayment; onVoided: (message: string) => Promise<void> | void }) {
  const [open, setOpen]     = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await postJson(`/api/platform/payments/${payment.id}/void`, { reason })
      setOpen(false)
      await onVoided(d.restored
        ? 'Pago anulado. La vigencia regresó a como estaba antes de ese pago.'
        : 'Pago anulado. La vigencia no se cambió porque se modificó después del pago.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return <button type="button" className={s.linkDanger} onClick={() => setOpen(true)}>Anular</button>
  return (
    <div className={s.voidBox}>
      <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Motivo (ej. capturado dos veces)" aria-label="Motivo para anular" autoFocus />
      <div className={s.voidActions}>
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setError('') }} disabled={busy}>No</button>
        <button type="button" className="btn btn-dark" onClick={confirm} disabled={busy}>{busy ? 'Anulando…' : 'Sí, anular'}</button>
      </div>
      {error && <div className={cx(s.msg, s.msgErr)} role="alert">{error}</div>}
    </div>
  )
}

/* ── Renglón de pago ────────────────────────────────────────────────────── */
export function PaymentRow({ payment: p, showStore, canVoid, onVoided }: {
  payment: StorePayment; showStore?: boolean; canVoid: boolean; onVoided: (message: string) => Promise<void> | void
}) {
  const voided = !!p.voided_at
  const detail = [
    `${p.months} ${p.months === 1 ? 'mes' : 'meses'}`,
    PAYMENT_METHOD_LABELS[p.method],
    p.invoice_requested ? (p.invoice_number ? `factura ${p.invoice_number}` : 'pidió factura') : null,
    `cubre hasta ${fmtDate(p.period_end, { day: 'numeric', month: 'short', year: 'numeric' })}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className={cx(s.payRow, voided && s.payVoided)}>
      <span className={s.payDate}>{fmtDay(p.paid_on, { day: 'numeric', month: 'short' })}</span>
      <span className={s.payMain}>
        {showStore && (
          <Link href={`/admin/tiendas?tienda=${p.store_id}`} className={s.payStore}>{p.store_name ?? 'Tienda'}</Link>
        )}
        <small>{detail}</small>
        {p.notes && <small>{p.notes}</small>}
        {voided && <small className={s.payVoidNote}>Anulado el {fmtDate(p.voided_at)}{p.void_reason ? `: ${p.void_reason}` : ''}</small>}
      </span>
      <span className={s.payAmount}>{fmtMoney(p.amount)}</span>
      <span className={s.payState}>
        {voided
          ? <em className={cx(s.badge, s.bMuted)}>Anulado</em>
          : p.method === 'cortesia'
            ? <em className={cx(s.badge, s.bTrial)}>Cortesía</em>
            : <em className={cx(s.badge, s.bActive)}>Pagado</em>}
      </span>
      {/* Cerrado ocupa su columna; abierto baja a un renglón completo (CSS) */}
      {!voided && canVoid ? <VoidControl payment={p} onVoided={onVoided} /> : <span />}
    </div>
  )
}
