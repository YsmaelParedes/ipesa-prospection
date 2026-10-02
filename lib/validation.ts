import { NextResponse } from 'next/server'

/**
 * Validación de entrada para API routes. `parseFields` hace dos cosas a la
 * vez: lista blanca de campos (evita mass assignment — cualquier llave que
 * no esté en el esquema se ignora) y validación de tipo/longitud de cada
 * valor, devolviendo un mensaje claro en español al primer error.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUUID = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

/** Lee el body como objeto JSON sin lanzar; null si no es un objeto válido. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
  } catch {
    return null
  }
}

type Base = { required?: boolean; nullable?: boolean; label?: string }
export type FieldSpec =
  | (Base & { type: 'text'; max: number; pattern?: RegExp })
  | (Base & { type: 'enum'; values: readonly string[] })
  | (Base & { type: 'number'; min?: number; max?: number })
  | (Base & { type: 'bool' })
  | (Base & { type: 'uuid' })
  | (Base & { type: 'date' })       // YYYY-MM-DD
  | (Base & { type: 'datetime' })   // ISO 8601 (con o sin zona)

export type Schema = Record<string, FieldSpec>

const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/

function validate(key: string, spec: FieldSpec, raw: unknown): { value?: unknown; error?: string } {
  const label = spec.label ?? key
  const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')

  if (empty) {
    if (spec.required) return { error: `${label} es requerido` }
    if (spec.nullable) return { value: null }
    if (spec.type === 'text') return { value: '' }
    return { error: `${label} no puede estar vacío` }
  }

  switch (spec.type) {
    case 'text': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return { error: `${label} debe ser texto` }
      const s = String(raw).trim()
      if (s.length > spec.max) return { error: `${label} excede ${spec.max} caracteres` }
      if (spec.pattern && !spec.pattern.test(s)) return { error: `${label} tiene un formato inválido` }
      return { value: s }
    }
    case 'enum':
      if (typeof raw !== 'string' || !spec.values.includes(raw)) return { error: `${label} no es un valor permitido` }
      return { value: raw }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) return { error: `${label} debe ser un número` }
      if (spec.min !== undefined && n < spec.min) return { error: `${label} debe ser mayor o igual a ${spec.min}` }
      if (spec.max !== undefined && n > spec.max) return { error: `${label} excede el máximo permitido` }
      return { value: n }
    }
    case 'bool':
      if (typeof raw !== 'boolean') return { error: `${label} debe ser verdadero o falso` }
      return { value: raw }
    case 'uuid':
      if (!isUUID(raw)) return { error: `${label} no es un identificador válido` }
      return { value: raw }
    case 'date':
      if (typeof raw !== 'string' || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) return { error: `${label} no es una fecha válida` }
      return { value: raw }
    case 'datetime':
      if (typeof raw !== 'string' || !DATETIME_RE.test(raw) || Number.isNaN(Date.parse(raw))) return { error: `${label} no es una fecha y hora válida` }
      return { value: raw }
  }
}

/**
 * Extrae y valida solo los campos del esquema.
 *  - partial=false (crear): exige los `required` y rellena faltantes opcionales como ausentes.
 *  - partial=true (editar): solo procesa las llaves presentes en el body.
 */
export type ParseResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

export function parseFields(
  body: Record<string, unknown>,
  schema: Schema,
  { partial = false }: { partial?: boolean } = {},
): ParseResult {
  const data: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(body, key)
    if (!present) {
      if (!partial && spec.required) return { ok: false, error: `${spec.label ?? key} es requerido` }
      continue
    }
    const { value, error } = validate(key, spec, body[key])
    if (error) return { ok: false, error }
    data[key] = value
  }
  return { ok: true, data }
}

/** Log de servidor + respuesta genérica (no filtra detalles internos al cliente). */
export function serverError(context: string, err: unknown, message = 'Error interno del servidor') {
  const detail = err instanceof Error ? err.message : (err as { message?: string })?.message ?? err
  console.error(`[${context}]`, detail)
  return NextResponse.json({ error: message }, { status: 500 })
}
