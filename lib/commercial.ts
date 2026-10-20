/**
 * Sistema comercial (docs/SISTEMA_COMERCIAL.md): estados del contacto,
 * resultados de cada llamada con su próxima fecha, cola "Para llamar hoy" y
 * conteos del control diario. Compartido por navegador y servidor.
 */
import { hasStreetNumber } from './address'

export const COMMERCIAL_STATUSES = ['nuevo', 'contactado', 'interes', 'cotizacion', 'cliente', 'no_interesado', 'depurar'] as const
export type CommercialStatus = typeof COMMERCIAL_STATUSES[number]

export const STATUS_INFO: Record<CommercialStatus, { label: string; color: string; bg: string }> = {
  nuevo:         { label: 'Nuevo',         color: 'var(--c-cyan-ink)',    bg: 'var(--c-cyan-soft)' },
  contactado:    { label: 'Contactado',    color: 'var(--c-teal-ink)',    bg: 'var(--c-teal-soft)' },
  interes:       { label: 'Interés',       color: 'var(--c-purple-ink)',  bg: 'var(--c-purple-soft)' },
  cotizacion:    { label: 'Cotización',    color: 'var(--warning)',       bg: 'var(--warning-soft)' },
  cliente:       { label: 'Cliente',       color: 'var(--success)',       bg: 'var(--success-soft)' },
  no_interesado: { label: 'No interesado', color: 'var(--muted)',         bg: 'var(--paper-2)' },
  depurar:       { label: 'Por depurar',   color: 'var(--danger)',        bg: 'var(--danger-soft)' },
}
export const statusInfo = (s: string | null | undefined) => STATUS_INFO[s as CommercialStatus] ?? STATUS_INFO.nuevo
export const isCommercialStatus = (v: unknown): v is CommercialStatus => typeof v === 'string' && (COMMERCIAL_STATUSES as readonly string[]).includes(v)

export const ACTIVITY_KINDS = ['llamada', 'whatsapp', 'visita', 'nota'] as const
export type ActivityKind = typeof ACTIVITY_KINDS[number]
export const KIND_LABELS: Record<ActivityKind, string> = { llamada: 'Llamada', whatsapp: 'WhatsApp', visita: 'Visita', nota: 'Nota' }

export const RESULTS = ['no_contesta', 'contactado', 'interes', 'cotizacion', 'venta', 'reprogramar', 'no_interesado', 'numero_equivocado'] as const
export type CallResult = typeof RESULTS[number]

type Rule = {
  label: string
  /** Días para la próxima acción; null = sin fecha (o la elige el vendedor si pickDate). */
  days: number | null
  /** Estado al que pasa el contacto; null = no cambia. */
  status: CommercialStatus | null
  action: string | null
  pickDate?: true
  askQuote?: true
  askSale?: true
}
export const RESULT_RULES: Record<CallResult, Rule> = {
  no_contesta:       { label: 'No contesta',        days: 1,    status: null,            action: 'Volver a llamar' },
  contactado:        { label: 'Contactado',         days: 3,    status: 'contactado',    action: 'Dar seguimiento' },
  interes:           { label: 'Interés',            days: 3,    status: 'interes',       action: 'Dar seguimiento' },
  cotizacion:        { label: 'Cotización enviada', days: 2,    status: 'cotizacion',    action: 'Confirmar la cotización', askQuote: true },
  venta:             { label: 'Venta',              days: 30,   status: 'cliente',       action: 'Ofrecer recompra', askSale: true },
  reprogramar:       { label: 'Reprogramar',        days: null, status: null,            action: 'Llamar', pickDate: true },
  no_interesado:     { label: 'No interesado',      days: 90,   status: 'no_interesado', action: 'Volver a ofrecer' },
  numero_equivocado: { label: 'Número equivocado',  days: null, status: 'depurar',       action: null },
}
export const isCallResult = (v: unknown): v is CallResult => typeof v === 'string' && Object.hasOwn(RESULT_RULES, v)
export const resultLabel = (r: string | null | undefined) => (r && isCallResult(r) ? RESULT_RULES[r].label : '')

/** Llamadas seguidas sin respuesta a partir de las cuales el contacto baja al final de su grupo. */
export const NO_ANSWER_LIMIT = 3

/** Contacto efectivo: hubo conversación (no cuenta "No contesta" ni "Número equivocado"). */
export const isEffective = (r: string | null | undefined) => !!r && r !== 'no_contesta' && r !== 'numero_equivocado'

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de la tienda. */
export function todayISO(timeZone = 'America/Mexico_City', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Lo que sugiere el resultado: estado, próxima acción y su fecha (el vendedor puede cambiarlas). */
export function suggestNext(result: CallResult, today: string) {
  const rule = RESULT_RULES[result]
  return {
    status: rule.status,
    nextAction: rule.action,
    nextAt: rule.days === null ? (rule.pickDate ? addDays(today, 1) : null) : addDays(today, rule.days),
  }
}

export type CommercialContact = {
  id: string; name: string; phone: string; email: string | null; company: string | null
  address: string | null; postal_code: string | null; segment: string | null; acquisition_channel: string | null
  colonia: string | null; owner_id: string | null; owner_name?: string
  commercial_status: CommercialStatus; next_action: string | null; next_action_at: string | null
  last_activity_at: string | null; last_result: string | null; last_note: string | null
  no_answer_streak: number; created_at: string
}

export type Bucket = 'vencido' | 'hoy' | 'nuevo' | 'programado' | 'sin_fecha' | 'depurar'
export type BucketFields = Pick<CommercialContact, 'commercial_status' | 'next_action_at' | 'last_activity_at' | 'address'>

/**
 * Dónde cae el contacto hoy. Un contacto con fecha siempre sigue su fecha. Uno
 * que nunca se ha trabajado entra a la cola solo si su dirección trae calle y
 * número; si no, va a "Por depurar".
 */
export function bucketOf(c: BucketFields, today: string): Bucket {
  if (c.commercial_status === 'depurar') return 'depurar'
  if (c.next_action_at) return c.next_action_at < today ? 'vencido' : c.next_action_at === today ? 'hoy' : 'programado'
  if (!c.last_activity_at) return hasStreetNumber(c.address) ? 'nuevo' : 'depurar'
  return 'sin_fecha'
}
export const inQueue = (b: Bucket) => b === 'vencido' || b === 'hoy' || b === 'nuevo'

const BUCKET_RANK: Record<Bucket, number> = { vencido: 0, hoy: 1, nuevo: 2, programado: 3, sin_fecha: 4, depurar: 5 }

/** Orden de la cola: vencidos, hoy, nuevos; dentro de cada grupo, los que no contestan al final. */
export function queueCompare(today: string) {
  return (a: BucketFields & Pick<CommercialContact, 'no_answer_streak' | 'created_at'>, b: typeof a) => {
    const ra = BUCKET_RANK[bucketOf(a, today)], rb = BUCKET_RANK[bucketOf(b, today)]
    if (ra !== rb) return ra - rb
    const la = a.no_answer_streak >= NO_ANSWER_LIMIT ? 1 : 0, lb = b.no_answer_streak >= NO_ANSWER_LIMIT ? 1 : 0
    if (la !== lb) return la - lb
    if (a.next_action_at && b.next_action_at && a.next_action_at !== b.next_action_at) return a.next_action_at < b.next_action_at ? -1 : 1
    return String(a.created_at).localeCompare(String(b.created_at))
  }
}

// ── Metas y control diario ────────────────────────────────────────────────
export const GOAL_KEYS = ['calls', 'effective', 'quotes', 'followups', 'sales'] as const
export type GoalKey = typeof GOAL_KEYS[number]
export type Goals = Record<GoalKey, number>
export const GOAL_LABELS: Record<GoalKey, string> = {
  calls: 'Llamadas', effective: 'Contactos efectivos', quotes: 'Cotizaciones', followups: 'Seguimientos', sales: 'Ventas',
}
export const DEFAULT_GOALS: Goals = { calls: 25, effective: 12, quotes: 5, followups: 10, sales: 2 }

export function parseGoals(raw: unknown): Goals {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return Object.fromEntries(GOAL_KEYS.map(k => {
    const n = Number(src[k])
    return [k, Number.isInteger(n) && n >= 0 && n <= 999 ? n : DEFAULT_GOALS[k]]
  })) as Goals
}

export type ActivityForCount = { kind: string; result: string | null; is_followup: boolean; quote_amount: number | string | null; sale_amount: number | string | null }
export type DayCounts = Goals & { quoted: number; sold: number }

/** Lo que cuenta para las metas. Las notas no cuentan como contacto. */
export function countActivities(list: ActivityForCount[]): DayCounts {
  const c: DayCounts = { calls: 0, effective: 0, quotes: 0, followups: 0, sales: 0, quoted: 0, sold: 0 }
  for (const a of list) {
    c.quoted += Number(a.quote_amount) || 0
    c.sold += Number(a.sale_amount) || 0
    if (a.kind === 'nota') continue
    if (a.kind === 'llamada') c.calls++
    if (isEffective(a.result)) c.effective++
    if (a.result === 'cotizacion') c.quotes++
    if (a.result === 'venta') c.sales++
    if (a.is_followup) c.followups++
  }
  return c
}
