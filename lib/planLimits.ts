/**
 * Límites de contactos y leads del plan Litro. La base los hace cumplir con
 * un trigger (enforce_plan_quota) que rechaza la inserción con el mensaje
 * "PLAN_LIMIT:<tipo>:<límite>"; aquí se traduce a una respuesta clara.
 * Compartido por cliente y servidor (sin dependencias de Node).
 */

export type LimitKind = 'contacts' | 'leads'

const NOUN: Record<LimitKind, string> = { contacts: 'contactos', leads: 'leads' }

export function planLimitMessage(kind: LimitKind, limit: number): string {
  return `Llegaste a los ${limit} ${NOUN[kind]} del plan Litro. Cambia a Galón para registrar sin límite.`
}

/** Si el error de la base es el límite del plan, devuelve tipo y límite. */
export function parsePlanLimitError(error: { code?: string; message?: string } | null | undefined): { kind: LimitKind; limit: number } | null {
  const m = /^PLAN_LIMIT:(contacts|leads):(\d+)$/.exec(error?.message ?? '')
  return m ? { kind: m[1] as LimitKind, limit: Number(m[2]) } : null
}

/** Respuesta 402 con código PLAN_LIMIT (el cliente puede ofrecer cambiar de plan). */
export function planLimitResponse(kind: LimitKind, limit: number): Response {
  return Response.json({ error: planLimitMessage(kind, limit), code: 'PLAN_LIMIT', kind, limit }, { status: 402 })
}

/** Cuántos lugares quedan (null = sin límite). */
export function remainingSlots(limit: number | null, used: number): number | null {
  return limit === null ? null : Math.max(0, limit - used)
}
