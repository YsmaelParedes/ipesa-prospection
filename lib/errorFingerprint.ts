import { createHash } from 'node:crypto'

/**
 * Limpieza y "huella" de los errores que se reportan al dueño de la plataforma.
 * Solo servidor y pruebas (usa node:crypto). Funciones puras.
 */

export type ErrorSource = 'server' | 'client' | 'cron' | 'webhook' | 'render' | 'whatsapp' | 'test'

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
// Llaves, tokens y JWT: largos y mezclan letras con números (los nombres de restricciones llevan guiones bajos pero no números)
const TOKEN = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g
// Teléfonos y otros números largos
const LONG_NUMBER = /\d{7,}/g

export const MAX_MESSAGE = 300
export const MAX_CONTEXT = 200

/** Mensaje corto y sin datos personales: nada de correos, teléfonos, ids ni llaves. */
export function cleanMessage(raw: unknown, max = MAX_MESSAGE): string {
  const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : (raw as { message?: unknown } | null)?.message
  const base = typeof text === 'string' ? text
    : raw == null ? ''
    : (() => { try { return JSON.stringify(raw) ?? '' } catch { return '' } })()
  return base
    .replace(EMAIL, '<correo>')
    .replace(UUID, '<id>')
    .replace(TOKEN, '<llave>')
    .replace(LONG_NUMBER, '<número>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'Error sin mensaje'
}

/** Ruta o contexto sin ids ni números (para que "/leads/123" y "/leads/456" sean lo mismo). */
export function cleanContext(raw: string, max = MAX_CONTEXT): string {
  return String(raw ?? '').replace(UUID, '<id>').replace(/\s+/g, ' ').trim().slice(0, max) || 'sin contexto'
}

/** Misma falla con otro id, número o correo = misma huella. */
export function fingerprintOf(source: ErrorSource, context: string, message: string): string {
  const norm = (t: string) => t.toLowerCase().replace(/<[^>]*>/g, '#').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
  return createHash('sha1').update(`${source}|${norm(cleanContext(context))}|${norm(cleanMessage(message))}`).digest('hex')
}

/** Errores que no son fallas: el usuario cerró la pestaña, canceló, o Next.js los usa para redirigir. */
export function isIgnorableError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; digest?: string } | null
  if (e?.name === 'AbortError') return true
  if (typeof e?.digest === 'string' && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(e.digest)) return true
  const msg = typeof e?.message === 'string' ? e.message : ''
  return /\b(aborted|AbortError)\b/i.test(msg) && /operation|request|signal/i.test(msg)
}
