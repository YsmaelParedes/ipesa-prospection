/**
 * Cambios a un cliente que no son actividades (cliente y servidor, sin
 * dependencias de Node): cambiar la fecha del seguimiento, corregir un monto y
 * borrar la última actividad. Cada uno deja una línea en el historial
 * (tabla commercial_events) y no cuenta para las metas ni para Reportes.
 */
import { RESULT_RULES, isCallResult, resultLabel, KIND_LABELS, type ActivityKind } from './commercial'

export type CommercialEvent = { id: string; kind: 'fecha' | 'monto' | 'borrado'; detail: string; created_at: string; user_name: string | null }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** "2026-11-22" (o una fecha con hora) → "22 nov". */
export function dayShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return y && m && d ? `${d} ${MONTHS[m - 1]}` : ''
}

/** $32,500 o $7,012.50 (centavos solo si los hay). */
export const moneyText = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

/** Lo que dice el historial al poner o cambiar la fecha del seguimiento. */
export function followupDetail(
  before: { at: string | null; action: string | null },
  after: { at: string; action: string },
): string {
  const what = after.action && after.action !== before.action ? ` · «${after.action}»` : ''
  if (!before.at) return `Puso seguimiento para el ${dayShort(after.at)}${what}`
  if (before.at === after.at) return `Cambió el seguimiento a «${after.action}» (${dayShort(after.at)})`
  return `Cambió el seguimiento del ${dayShort(before.at)} al ${dayShort(after.at)}${what}`
}

/** Lo que dice el historial al corregir el monto de una cotización o venta. */
export function amountDetail(a: { quote_amount: number | string | null; sale_amount: number | string | null; created_at: string }, to: number): string {
  const sale = a.sale_amount != null
  const from = Number(sale ? a.sale_amount : a.quote_amount)
  return `Corrigió el monto de la ${sale ? 'venta' : 'cotización'} del ${dayShort(a.created_at)}: ${moneyText(from)} → ${moneyText(to)}`
}

/** Lo que dice el historial al borrar una actividad. */
export function deletedDetail(a: { kind: string; result: string | null; quote_amount: number | string | null; sale_amount: number | string | null; created_at: string }): string {
  const label = [KIND_LABELS[a.kind as ActivityKind] ?? a.kind, a.result ? resultLabel(a.result) : null].filter(Boolean).join(' · ')
  const amount = a.quote_amount != null ? ` · ${moneyText(Number(a.quote_amount))}` : a.sale_amount != null ? ` · ${moneyText(Number(a.sale_amount))}` : ''
  return `Borró «${label}${amount}» del ${dayShort(a.created_at)}`
}

export type ContactState = {
  commercial_status: string; next_action: string | null; next_action_at: string | null
  last_activity_at: string | null; last_result: string | null; last_note: string | null; no_answer_streak: number
}
export type HistoryActivity = {
  kind: string; result: string | null; note: string | null
  next_action: string | null; next_action_at: string | null; created_at: string
}

/**
 * Cómo quedaría el cliente con solo estas actividades (de la más vieja a la
 * más nueva), aplicando las mismas reglas que al registrar. Sirve para borrar
 * una actividad registrada antes de que se guardara cómo estaba el cliente
 * (prev_state): sin actividades previas vuelve a Prospecto.
 */
export function stateFromHistory(activities: HistoryActivity[]): ContactState {
  const s: ContactState = {
    commercial_status: 'nuevo', next_action: null, next_action_at: null,
    last_activity_at: null, last_result: null, last_note: null, no_answer_streak: 0,
  }
  for (const a of activities) {
    if (a.note?.trim()) s.last_note = a.note.trim()
    if (a.kind === 'nota') continue
    s.next_action = a.next_action
    s.next_action_at = a.next_action_at
    s.last_activity_at = a.created_at
    if (a.result) s.last_result = a.result
    const status = isCallResult(a.result) ? RESULT_RULES[a.result].status : null
    if (status) s.commercial_status = status
    s.no_answer_streak = a.result === 'no_contesta' ? s.no_answer_streak + 1
      : a.result === null || a.result === 'enviado' || a.result === 'correo_incorrecto' ? s.no_answer_streak : 0
  }
  return s
}
