'use client'

import { useMemo, useState } from 'react'
import { fmtMoney } from '@/lib/payments'
import { currentMonth, usePayments } from '../data'
import { PaymentRow } from '../payments-ui'
import s from '../admin.module.css'

/**
 * Panel del dueño › Pagos: lo que se cobró cada mes (por fecha del pago),
 * con los anulados tachados. Se registran desde la ficha de cada tienda.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function PaymentsPage() {
  const thisMonth = currentMonth()
  const [month, setMonth] = useState(thisMonth)
  const { payments, error, reload } = usePayments({ month })
  const [msg, setMsg] = useState('')

  const totals = useMemo(() => {
    const live = (payments ?? []).filter(p => !p.voided_at)
    return {
      collected: live.reduce((t, p) => t + p.amount, 0),
      count: live.length,
      invoices: live.filter(p => p.invoice_requested).length,
      courtesy: live.filter(p => p.method === 'cortesia').length,
    }
  }, [payments])

  const voided = async (text: string) => { await reload(); setMsg(text) }

  return (
    <div className={s.page}>
      <div className="section-head"><h2>Pagos</h2></div>

      <div className={s.toolbar}>
        <div className={s.monthNav} role="group" aria-label="Mes">
          <button className="btn-icon" onClick={() => { setMonth(shiftMonth(month, -1)); setMsg('') }} aria-label="Mes anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="btn-icon" onClick={() => { setMonth(shiftMonth(month, 1)); setMsg('') }} disabled={month >= thisMonth} aria-label="Mes siguiente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <span className={s.hint}>Para registrar un pago, abre la tienda en Tiendas.</span>
      </div>

      {payments && (
        <div className={cx(s.kpis, s.kpis3)}>
          <div className={cx(s.kpi, s.kGreen)}><small>Cobrado</small><strong>{fmtMoney(totals.collected)}</strong><span>sin contar anulados</span></div>
          <div className={s.kpi}><small>Pagos</small><strong>{totals.count}</strong><span>{totals.courtesy ? `${totals.courtesy} de cortesía` : 'registrados'}</span></div>
          <div className={cx(s.kpi, s.kCyan)}><small>Con factura</small><strong>{totals.invoices}</strong><span>pidieron factura</span></div>
        </div>
      )}

      {msg && <div className={cx(s.msg, s.msgOk)} role="status" style={{ marginTop: 0 }}>{msg}</div>}
      {error && <div className={s.error}>{error}</div>}
      {!payments && !error && <div className={s.center}><span className={s.spinner} /></div>}

      {payments && (
        <div className={s.panel}>
          {payments.length === 0
            ? <div className={s.panelEmpty} style={{ paddingTop: 18 }}>No hay pagos registrados en {monthLabel(month).toLowerCase()}.</div>
            : <div className={s.payList}>
                {payments.map(p => <PaymentRow key={p.id} payment={p} showStore canVoid onVoided={voided} />)}
              </div>}
        </div>
      )}
    </div>
  )
}
