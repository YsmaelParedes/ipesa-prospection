/**
 * Pagos de las tiendas (panel del dueño): métodos, formato de dinero y la
 * regla de vigencia. Compartido por cliente y servidor (sin dependencias de
 * Node). El registro real lo hace la función record_store_payment de la base.
 */

export const PAYMENT_METHODS = ['transferencia', 'efectivo', 'tarjeta', 'deposito', 'cortesia', 'otro'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta',
  deposito: 'Depósito', cortesia: 'Cortesía', otro: 'Otro',
}

export const MAX_PAYMENT_MONTHS = 36
export const MAX_AMOUNT = 1_000_000

export type StorePayment = {
  id: string
  store_id: string
  store_name: string | null
  amount: number
  method: PaymentMethod
  paid_on: string            // YYYY-MM-DD
  months: number
  period_start: string
  period_end: string
  invoice_requested: boolean
  invoice_number: string | null
  notes: string | null
  created_at: string
  voided_at: string | null
  void_reason: string | null
}

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
const moneyInt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
/** $1,497 · $499.50 */
export const fmtMoney = (n: number) => (Number.isInteger(n) ? moneyInt : money).format(n)

/** Suma meses de calendario; si el día no existe (31 → febrero) se queda en el último del mes, como Postgres. */
export function addMonths(date: Date, months: number): Date {
  const r = new Date(date)
  const day = r.getDate()
  r.setDate(1)
  r.setMonth(r.getMonth() + months)
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()))
  return r
}

/** Hasta cuándo quedaría pagada: se suma a lo pagado si sigue vigente; si no, desde hoy. */
export function paidUntilAfter(paidUntil: string | null, months: number, now = Date.now()): Date {
  const base = paidUntil && new Date(paidUntil).getTime() > now ? new Date(paidUntil) : new Date(now)
  return addMonths(base, months)
}

/** Fecha local de hoy como YYYY-MM-DD (para el campo "Fecha del pago"). */
export function todayISO(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** "2026-10" → primer día del mes y del siguiente, para filtrar paid_on. */
export function monthBounds(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  return { from: `${month}-01`, to: `${next}-01` }
}

/** Monto válido: 0 … MAX_AMOUNT con máximo 2 decimales (tolerante a 499.99 × 100 = 49998.999…). */
export function isMoney(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT && Math.abs(Math.round(n * 100) - n * 100) < 1e-6
}

/** Valida una fecha YYYY-MM-DD real. */
export function isISODate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
