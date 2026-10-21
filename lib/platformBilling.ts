/**
 * Cobros de Stripe para el panel del dueño (solo servidor): ingreso mensual
 * de las suscripciones vigentes, lo cobrado en el mes y las facturas de una
 * tienda. Solo cuenta clientes que son tiendas de Matices: la cuenta de
 * Stripe puede tener otros productos.
 */
import type Stripe from 'stripe'
import { getStripe, planForPrice } from './stripe'

export type BillingOverview = {
  /** Moneda de los cobros (la de los precios en Stripe) */
  currency: string
  /** Suma mensual de las suscripciones activas o reintentando el cobro, en pesos (antes de descuentos) */
  mrr: number
  subscriptions: number
  /** Facturas pagadas desde el día 1 del mes (hora de Ciudad de México) */
  collected: number
  paidInvoices: number
  /** Facturas abiertas con el cobro vencido o fallido */
  openInvoices: number
  openAmount: number
}

export type PlatformInvoice = {
  id: string
  number: string | null
  status: string
  amount: number
  currency: string
  created: string
  paidAt: string | null
  url: string | null
}

const MAX_ROWS = 1000
const customerOf = (c: string | { id: string } | null) => (typeof c === 'string' ? c : c?.id ?? null)

/** Día 1 del mes en curso a las 00:00 de Ciudad de México (UTC−6, sin horario de verano). */
export function monthStartMexico(now = new Date()): Date {
  const mx = new Date(now.getTime() - 6 * 3_600_000)
  return new Date(Date.UTC(mx.getUTCFullYear(), mx.getUTCMonth(), 1, 6))
}

export async function billingOverview(customers: Set<string>, now = new Date()): Promise<BillingOverview> {
  const stripe = getStripe()
  const since = Math.floor(monthStartMexico(now).getTime() / 1000)
  const [subs, paid, open] = await Promise.all([
    stripe.subscriptions.list({ status: 'all', limit: 100 }).autoPagingToArray({ limit: MAX_ROWS }),
    stripe.invoices.list({ status: 'paid', created: { gte: since }, limit: 100 }).autoPagingToArray({ limit: MAX_ROWS }),
    stripe.invoices.list({ status: 'open', limit: 100 }).autoPagingToArray({ limit: MAX_ROWS }),
  ])

  let mrr = 0, subscriptions = 0, currency = ''
  for (const sub of subs) {
    if (sub.status !== 'active' && sub.status !== 'past_due') continue
    if (!customers.has(customerOf(sub.customer) ?? '')) continue
    let counted = false
    for (const item of sub.items.data) {
      if (!(await planForPrice(item.price))) continue
      mrr += monthlyAmount(item)
      currency ||= item.price.currency
      counted = true
    }
    if (counted) subscriptions++
  }

  const ours = (inv: Stripe.Invoice) => customers.has(customerOf(inv.customer) ?? '')
  const paidOurs = paid.filter(ours)
  const overdue = open.filter(inv => ours(inv) && inv.attempt_count > 0)
  return {
    currency: currency || paidOurs[0]?.currency || 'mxn',
    mrr: mrr / 100,
    subscriptions,
    collected: paidOurs.reduce((t, inv) => t + inv.amount_paid, 0) / 100,
    paidInvoices: paidOurs.length,
    openInvoices: overdue.length,
    openAmount: overdue.reduce((t, inv) => t + inv.amount_remaining, 0) / 100,
  }
}

/** Monto de un concepto llevado a un mes (en centavos). */
function monthlyAmount(item: Stripe.SubscriptionItem): number {
  const unit = item.price.unit_amount ?? 0
  const rec = item.price.recurring
  const total = unit * (item.quantity ?? 1)
  if (!rec) return 0
  const months = rec.interval === 'year' ? 12 * rec.interval_count
    : rec.interval === 'month' ? rec.interval_count
    : rec.interval === 'week' ? rec.interval_count / (52 / 12)
    : rec.interval_count / (365 / 12)
  return total / months
}

export async function customerInvoices(customerId: string, limit = 8): Promise<PlatformInvoice[]> {
  const res = await getStripe().invoices.list({ customer: customerId, limit })
  return res.data
    .filter(inv => inv.status !== 'draft')
    .map(inv => ({
      id: inv.id ?? '',
      number: inv.number,
      status: inv.status ?? 'open',
      amount: (inv.status === 'paid' ? inv.amount_paid : inv.amount_due) / 100,
      currency: inv.currency,
      created: new Date(inv.created * 1000).toISOString(),
      paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : null,
      url: inv.hosted_invoice_url ?? null,
    }))
}
