/**
 * Sistema comercial (docs/SISTEMA_COMERCIAL.md): un solo avance por cliente
 * (Prospecto → Contactado → Cotización → Cliente), resultados de cada
 * actividad con su próxima fecha, lista de "Hoy" y conteos contra la meta.
 * Compartido por navegador y servidor.
 *
 * En la base siguen los valores de siempre: "nuevo" se muestra como
 * Prospecto, "depurar" como Número incorrecto e "interes" (ya no se usa) como
 * Contactado.
 */

export const COMMERCIAL_STATUSES = ['nuevo', 'contactado', 'interes', 'cotizacion', 'cliente', 'no_interesado', 'depurar'] as const
export type CommercialStatus = typeof COMMERCIAL_STATUSES[number]

export const STATUS_INFO: Record<CommercialStatus, { label: string; color: string; bg: string }> = {
  nuevo:         { label: 'Prospecto',         color: 'var(--c-cyan-ink)',    bg: 'var(--c-cyan-soft)' },
  contactado:    { label: 'Contactado',        color: 'var(--c-teal-ink)',    bg: 'var(--c-teal-soft)' },
  interes:       { label: 'Contactado',        color: 'var(--c-teal-ink)',    bg: 'var(--c-teal-soft)' },
  cotizacion:    { label: 'Cotización',        color: 'var(--warning)',       bg: 'var(--warning-soft)' },
  cliente:       { label: 'Cliente',           color: 'var(--success)',       bg: 'var(--success-soft)' },
  no_interesado: { label: 'No interesado',     color: 'var(--muted)',         bg: 'var(--paper-2)' },
  depurar:       { label: 'Número incorrecto', color: 'var(--danger)',        bg: 'var(--danger-soft)' },
}
/** Los que se pueden elegir a mano (sin "interes", que ya no se usa). */
export const STATUS_CHOICES = ['nuevo', 'contactado', 'cotizacion', 'cliente', 'no_interesado', 'depurar'] as const
export const statusInfo = (s: string | null | undefined) => STATUS_INFO[s as CommercialStatus] ?? STATUS_INFO.nuevo
export const isCommercialStatus = (v: unknown): v is CommercialStatus => typeof v === 'string' && (COMMERCIAL_STATUSES as readonly string[]).includes(v)

export const PRIORITIES = ['alta', 'media', 'baja'] as const
export type Priority = typeof PRIORITIES[number]
export const PRIORITY_INFO: Record<Priority, { label: string; color: string; bg: string; rank: number }> = {
  alta:  { label: 'Alta',  color: 'var(--danger)',     bg: 'var(--danger-soft)',  rank: 0 },
  media: { label: 'Media', color: 'var(--warning)',    bg: 'var(--warning-soft)', rank: 1 },
  baja:  { label: 'Baja',  color: 'var(--muted)',      bg: 'var(--paper-2)',      rank: 2 },
}
export const priorityInfo = (p: string | null | undefined) => PRIORITY_INFO[p as Priority] ?? PRIORITY_INFO.media

/** Sugerencias para "Origen" (se puede escribir otro). */
export const ORIGINS = ['Visita de campo', 'Llamada', 'Recomendación', 'WhatsApp', 'Redes sociales', 'Sucursal', 'Otro'] as const

/** Probabilidad de cierre según el avance (como en el Excel de seguimiento). */
export const STAGE_PROBABILITY: Record<string, number> = { contactado: 0.5, interes: 0.5, cotizacion: 0.75, cliente: 1 }

/** Días completos desde una fecha/hora hasta hoy (AAAA-MM-DD). */
export function daysSince(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null
  const from = Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`), to = Date.parse(`${today}T12:00:00Z`)
  return Number.isNaN(from) ? null : Math.max(0, Math.round((to - from) / 86_400_000))
}

export const ACTIVITY_KINDS = ['llamada', 'whatsapp', 'visita', 'nota'] as const
export type ActivityKind = typeof ACTIVITY_KINDS[number]
export const KIND_LABELS: Record<ActivityKind, string> = { llamada: 'Llamada', whatsapp: 'WhatsApp', visita: 'Visita', nota: 'Nota' }

export const RESULTS = ['no_contesta', 'contactado', 'interes', 'cotizacion', 'venta', 'reprogramar', 'no_interesado', 'numero_equivocado'] as const
export type CallResult = typeof RESULTS[number]
/** Los 6 resultados que se eligen al registrar ("interes" y "reprogramar" quedan solo en el historial). */
export const RESULT_CHOICES = ['no_contesta', 'contactado', 'cotizacion', 'venta', 'no_interesado', 'numero_equivocado'] as const
export type ResultChoice = typeof RESULT_CHOICES[number]

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
  no_contesta:       { label: 'Sin contacto',       days: 1,    status: null,            action: 'Volver a llamar' },
  contactado:        { label: 'Contactado',         days: 3,    status: 'contactado',    action: 'Dar seguimiento' },
  interes:           { label: 'Interés',            days: 3,    status: 'contactado',    action: 'Dar seguimiento' },
  cotizacion:        { label: 'Cotización enviada', days: 2,    status: 'cotizacion',    action: 'Confirmar la cotización', askQuote: true },
  venta:             { label: 'Venta',              days: 30,   status: 'cliente',       action: 'Ofrecer recompra', askSale: true },
  reprogramar:       { label: 'Reprogramar',        days: null, status: null,            action: 'Llamar', pickDate: true },
  no_interesado:     { label: 'No interesado',      days: 90,   status: 'no_interesado', action: 'Volver a ofrecer' },
  numero_equivocado: { label: 'Número incorrecto',  days: null, status: 'depurar',       action: null },
}
export const isCallResult = (v: unknown): v is CallResult => typeof v === 'string' && Object.hasOwn(RESULT_RULES, v)
export const resultLabel = (r: string | null | undefined) => (r && isCallResult(r) ? RESULT_RULES[r].label : '')

/** Llamadas seguidas sin respuesta a partir de las cuales el contacto baja al final de su grupo. */
export const NO_ANSWER_LIMIT = 3

/** Contacto efectivo: hubo conversación (no cuenta "Sin contacto" ni "Número incorrecto"). */
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

/** Qué va a pasar al guardar, en palabras del vendedor. */
export function outcomeText(result: CallResult): string {
  switch (result) {
    case 'no_contesta':       return 'Vuelve a aparecer en tu lista en la fecha que elijas'
    case 'contactado':        return 'Pasa a Contactado · 50 %'
    case 'interes':           return 'Pasa a Contactado · 50 %'
    case 'cotizacion':        return 'Pasa a Cotización · 75 % y aparece en tus Oportunidades'
    case 'venta':             return 'Pasa a Cliente. Te recordamos ofrecer recompra'
    case 'reprogramar':       return 'Vuelve en la fecha que elijas'
    case 'no_interesado':     return 'Sale de tu lista y vuelve en 90 días'
    case 'numero_equivocado': return 'Sale de la lista para corregir el número'
  }
}

export type CommercialContact = {
  id: string; name: string; phone: string | null; email: string | null; company: string | null
  address: string | null; postal_code: string | null; segment: string | null; acquisition_channel: string | null
  colonia: string | null; zone: string | null; owner_id: string | null; owner_name?: string | null
  priority: Priority; potential_monthly: number | string | null; origin: string | null
  commercial_status: CommercialStatus; next_action: string | null; next_action_at: string | null
  last_activity_at: string | null; last_result: string | null; last_note: string | null
  no_answer_streak: number; created_at: string
}

export type Bucket = 'vencido' | 'hoy' | 'nuevo' | 'programado' | 'sin_fecha' | 'depurar'
export type BucketFields = Pick<CommercialContact, 'commercial_status' | 'next_action_at' | 'last_activity_at' | 'address'>

/** Dónde cae el contacto hoy. Un contacto con fecha siempre sigue su fecha; uno nunca trabajado es prospecto nuevo. */
export function bucketOf(c: BucketFields, today: string): Bucket {
  if (c.commercial_status === 'depurar') return 'depurar'
  if (c.next_action_at) return c.next_action_at < today ? 'vencido' : c.next_action_at === today ? 'hoy' : 'programado'
  if (!c.last_activity_at) return 'nuevo'
  return 'sin_fecha'
}
export const inQueue = (b: Bucket) => b === 'vencido' || b === 'hoy' || b === 'nuevo'

const BUCKET_RANK: Record<Bucket, number> = { vencido: 0, hoy: 1, nuevo: 2, programado: 3, sin_fecha: 4, depurar: 5 }

/**
 * Orden de la cola: vencidos, hoy, nuevos. Dentro de cada grupo: los que no
 * contestan al final y, antes, la prioridad alta.
 */
export function queueCompare(today: string) {
  return (a: BucketFields & Pick<CommercialContact, 'no_answer_streak' | 'created_at'> & { priority?: string | null }, b: typeof a) => {
    const ra = BUCKET_RANK[bucketOf(a, today)], rb = BUCKET_RANK[bucketOf(b, today)]
    if (ra !== rb) return ra - rb
    const la = a.no_answer_streak >= NO_ANSWER_LIMIT ? 1 : 0, lb = b.no_answer_streak >= NO_ANSWER_LIMIT ? 1 : 0
    if (la !== lb) return la - lb
    const pa = priorityInfo(a.priority).rank, pb = priorityInfo(b.priority).rank
    if (pa !== pb) return pa - pb
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
export const DEFAULT_GOALS: Goals = { calls: 30, effective: 15, quotes: 6, followups: 10, sales: 2 }

export function parseGoals(raw: unknown): Goals {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return Object.fromEntries(GOAL_KEYS.map(k => {
    const n = Number(src[k])
    return [k, Number.isInteger(n) && n >= 0 && n <= 999 ? n : DEFAULT_GOALS[k]]
  })) as Goals
}

/**
 * Metas guardadas en stores.commercial_goals: las de la tienda en la raíz
 * (forma de siempre) y, si el dueño las cambió para alguien, en byUser.
 */
export type GoalsConfig = { team: Goals; byUser: Record<string, Goals> }
export function parseGoalsConfig(raw: unknown): GoalsConfig {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const by = src.byUser && typeof src.byUser === 'object' ? src.byUser as Record<string, unknown> : {}
  return {
    team: parseGoals(src),
    byUser: Object.fromEntries(Object.entries(by).filter(([k]) => /^[0-9a-f-]{36}$/i.test(k)).map(([k, v]) => [k, parseGoals(v)])),
  }
}
export const goalsFor = (cfg: GoalsConfig, uid: string): Goals => cfg.byUser[uid] ?? cfg.team

/** Cumplimiento (0–1) contra la meta: cada indicador topado en 100 %, promedio de los que tienen meta. */
export function compliance(counts: Goals, goals: Goals, days = 1): number {
  const keys = GOAL_KEYS.filter(k => goals[k] > 0)
  if (!keys.length) return 0
  return keys.reduce((sum, k) => sum + Math.min(1, counts[k] / (goals[k] * Math.max(1, days))), 0) / keys.length
}

/** Días hábiles (lunes a sábado) del 1 del mes hasta la fecha, inclusive. */
export function workDaysUntil(isoDate: string): number {
  let n = 0
  for (let d = `${isoDate.slice(0, 7)}-01`; d <= isoDate; d = addDays(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) n++
  }
  return n
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
