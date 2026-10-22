/**
 * Agente de IA de Meta (Meta Business Agent Platform) de una tienda.
 * Todo va por número: `entity_id` = phone_number_id de la tienda.
 * Referencia: developers.facebook.com/documentation/meta-business-agent
 *  · settings:   GET/PUT {entity}/agent_config/settings
 *  · allowlist:  GET/POST {entity}/agent_config/allowlist, DELETE …/{entry_id}
 *  · onboarding: POST {entity}/agent_onboarding · eligibility: GET {entity}/agent_eligibility
 */
import { externalFetch } from './serverTiming'
import type { WhatsAppCreds } from './whatsapp'

const BASE = 'https://api.facebook.com'

export type AgentAudience = 'ALLOWLISTED_ONLY' | 'EVERYONE'
export type HandoffSelection = 'DEFAULT' | 'AGENT' | 'CUSTOM'

/** Segundos que acepta Meta para el seguimiento por inactividad (0 = apagado). */
export const FOLLOWUP_INTERVALS = [300, 900, 1800, 3600, 7200, 28800, 86400] as const

/** Meta acepta hasta 20 números de prueba por número de WhatsApp. */
export const MAX_TEST_NUMBERS = 20

export type AgentSettings = {
  agentId: string | null
  enabled: boolean
  audience: AgentAudience
  handoff: { enabled: boolean; selection: HandoffSelection; message: string }
  followup: { enabled: boolean; interval: number; message: string }
  /** null: Meta no regresa la lista al leer, así que no se puede mostrar. */
  neverSay: string[] | null
}

export type AgentResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string }

export async function agentFetch<T = any>(creds: Pick<WhatsAppCreds, 'token' | 'phoneNumberId'>, path: string, init: RequestInit = {}): Promise<AgentResult<T>> {
  try {
    const res = await externalFetch(`${BASE}/${creds.phoneNumberId}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'X-API-Version': '2.0.0',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(15_000),
    })
    const data = res.status === 204 ? null : await res.json().catch(() => null)
    if (res.ok) return { ok: true, status: res.status, data: data as T }
    return { ok: false, status: res.status, error: agentError(res.status, data) }
  } catch (error: any) {
    return { ok: false, status: 0, error: error?.name === 'TimeoutError' ? 'Meta tardó demasiado en responder' : 'No se pudo contactar a Meta' }
  }
}

/** Mensaje legible de un error de la API (StandardError: title + detail). */
export function agentError(status: number, data: any): string {
  const detail = data?.detail || data?.error?.error_user_msg || data?.error?.message || data?.title
  if (status === 401) return 'Meta rechazó el acceso al agente (permiso de mensajes de WhatsApp).'
  if (status === 403) return detail ? `Meta no lo permite: ${detail}` : 'Meta no lo permite. Revisa que la cuenta haya aceptado los términos del agente de IA.'
  if (status === 429) return 'Demasiados cambios seguidos. Espera unos minutos.'
  return detail ? String(detail) : `Error de Meta (${status})`
}

/** GET settings regresa una lista (una por agente); se usa la de WhatsApp. */
export function toSettings(raw: any): AgentSettings | null {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const s = list.find(x => x?.channel === 'whatsapp') ?? list[0]
  if (!s) return null
  const interval = Number(s.followup?.followup_interval_in_seconds) || 0
  return {
    agentId: typeof s.agent_id === 'string' ? s.agent_id : null,
    enabled: !!s.rollout?.enabled,
    // Meta usa EVERYONE si no se configuró
    audience: s.ai_audience === 'ALLOWLISTED_ONLY' ? 'ALLOWLISTED_ONLY' : 'EVERYONE',
    handoff: {
      enabled: !!s.handoff?.enabled,
      selection: (['DEFAULT', 'AGENT', 'CUSTOM'] as const).includes(s.handoff?.message_selection) ? s.handoff.message_selection : 'DEFAULT',
      message: typeof s.handoff?.message === 'string' ? s.handoff.message : '',
    },
    followup: {
      enabled: !!s.followup?.enabled && interval > 0,
      interval: (FOLLOWUP_INTERVALS as readonly number[]).includes(interval) ? interval : 3600,
      message: typeof s.followup?.message === 'string' ? s.followup.message : '',
    },
    neverSay: Array.isArray(s.never_say_phrases) ? s.never_say_phrases.filter((p: unknown) => typeof p === 'string') : null,
  }
}

const MAX_MESSAGE = 1000
const MAX_PHRASES = 50
const MAX_PHRASE = 200

/**
 * Valida lo que manda la pantalla y arma el cuerpo del PUT (actualización
 * parcial: solo lo que viene). Regresa un texto si algo no es válido.
 */
export function settingsPayload(input: Record<string, unknown>): Record<string, unknown> | string {
  const body: Record<string, unknown> = {}

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') return 'Encendido debe ser sí o no'
    body.rollout = { enabled: input.enabled }
  }
  if (input.audience !== undefined) {
    if (input.audience !== 'ALLOWLISTED_ONLY' && input.audience !== 'EVERYONE') return 'Público no válido'
    body.ai_audience = input.audience
  }
  if (input.handoff !== undefined) {
    const h = input.handoff as any
    if (!h || typeof h.enabled !== 'boolean') return 'Indica si la IA pasa el chat al equipo'
    if (!['DEFAULT', 'AGENT', 'CUSTOM'].includes(h.selection)) return 'Tipo de mensaje no válido'
    const message = typeof h.message === 'string' ? h.message.trim() : ''
    if (h.selection === 'CUSTOM' && !message) return 'Escribe el mensaje para cuando pasa el chat al equipo'
    if (message.length > MAX_MESSAGE) return `El mensaje puede tener hasta ${MAX_MESSAGE} caracteres`
    body.handoff = { enabled: h.enabled, message_selection: h.selection, ...(h.selection === 'CUSTOM' ? { message } : {}) }
  }
  if (input.followup !== undefined) {
    const f = input.followup as any
    if (!f || typeof f.enabled !== 'boolean') return 'Indica si se manda el recordatorio'
    const message = typeof f.message === 'string' ? f.message.trim() : ''
    if (f.enabled) {
      if (!(FOLLOWUP_INTERVALS as readonly number[]).includes(f.interval)) return 'Tiempo del recordatorio no válido'
      if (!message) return 'Escribe el mensaje del recordatorio'
      if (message.length > MAX_MESSAGE) return `El recordatorio puede tener hasta ${MAX_MESSAGE} caracteres`
      body.followup = { enabled: true, followup_interval_in_seconds: f.interval, message }
    } else {
      body.followup = { enabled: false, followup_interval_in_seconds: 0 }
    }
  }
  if (input.neverSay !== undefined) {
    if (!Array.isArray(input.neverSay) || input.neverSay.some(p => typeof p !== 'string')) return 'Frases no válidas'
    const phrases = [...new Set(input.neverSay.map(p => (p as string).trim()).filter(Boolean))]
    if (phrases.length > MAX_PHRASES) return `Hasta ${MAX_PHRASES} frases`
    if (phrases.some(p => p.length > MAX_PHRASE)) return `Cada frase puede tener hasta ${MAX_PHRASE} caracteres`
    body.never_say_phrases = phrases
  }
  if (!Object.keys(body).length) return 'No hay cambios'
  return body
}

/** Número de prueba en E.164, como lo pide Meta: +52 y 10 dígitos. */
export function toE164(phone10: string): string {
  return `+52${phone10}`
}
