'use client'

import { fmtMoney } from '@/lib/billing'
import { PLANS } from '@/lib/stores'
import { fmtDate, isStripePaid, planNow, stripeCustomerUrl, useInvoices, type PlatformStore } from './data'
import s from './admin.module.css'

/**
 * Suscripción en la ficha de una tienda: sus últimas facturas de Stripe (cada
 * una abre su recibo) y el enlace al cliente en Stripe para cobros,
 * reembolsos o cambios. Sin cliente de Stripe explica cómo contrata.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const INVOICE_STATE: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Pagada', cls: s.bActive },
  open: { label: 'Por cobrar', cls: s.bWarn },
  uncollectible: { label: 'Incobrable', cls: s.bDanger },
  void: { label: 'Anulada', cls: s.bMuted },
}

export function SubscriptionBlock({ store }: { store: PlatformStore }) {
  const customerUrl = stripeCustomerUrl(store)
  const { invoices, error } = useInvoices(store.stripe_customer_id ? store.id : null)
  const plan = planNow(store)

  if (!customerUrl) {
    return (
      <div className={s.block}>
        <div className={s.blockHead}><strong>Suscripción</strong><small>Sin Stripe</small></div>
        <p className={s.blockText}>
          {plan === 'litro'
            ? 'Usa Litro (gratis). Puede contratar Galón o Cubeta desde su tienda, en Configuración › Plan; el cobro lo hace Stripe.'
            : `Tiene ${PLANS[plan].label} sin cobro (lo asignaste aquí). Si contrata con Stripe, su suscripción toma el control del plan.`}
        </p>
      </div>
    )
  }

  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <strong>Facturas de Stripe</strong>
        <a href={customerUrl} target="_blank" rel="noopener noreferrer" className={s.panelLink}>Ver cliente en Stripe</a>
      </div>
      {!isStripePaid(store) && <p className={s.blockText}>No tiene una suscripción vigente; estas son sus facturas anteriores.</p>}
      {error && <div className={s.error}>{error}</div>}
      {!invoices && !error && <div className={s.center} style={{ padding: 16 }}><span className={s.spinner} /></div>}
      {invoices?.length === 0 && <div className={s.panelEmpty} style={{ padding: '4px 0 2px' }}>Todavía no tiene facturas.</div>}
      {invoices?.map(inv => {
        const state = INVOICE_STATE[inv.status] ?? { label: inv.status, cls: s.bMuted }
        return (
          <div key={inv.id} className={s.payRow}>
            <span className={s.payDate}>{fmtDate(inv.paidAt ?? inv.created, { day: 'numeric', month: 'short' })}</span>
            <span className={s.payMain}>
              <small>{[inv.number && `Factura ${inv.number}`, fmtDate(inv.created, { month: 'long', year: 'numeric' })].filter(Boolean).join(' · ')}</small>
            </span>
            <span className={s.payAmount}>{fmtMoney(inv.amount, inv.currency)}</span>
            <span className={s.payState}><em className={cx(s.badge, state.cls)}>{state.label}</em></span>
            {inv.url
              ? <a href={inv.url} target="_blank" rel="noopener noreferrer" className={s.panelLink}>Ver</a>
              : <span />}
          </div>
        )
      })}
    </div>
  )
}
