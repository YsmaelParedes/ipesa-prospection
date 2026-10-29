import { createHash } from 'node:crypto'
import { getServerSupabase } from './supabase-server'

/**
 * Límites de intentos.
 *
 *  · rateLimit: en memoria, por instancia. Se reinicia con cada arranque en
 *    frío; sirve como primer filtro barato (no toca la base).
 *  · limitShared: la cuenta vive en la base (rate_limit_take), igual para
 *    todas las instancias. Para lo sensible: iniciar sesión, crear cuentas o
 *    tiendas y mandar correos. Primero pasa por el filtro en memoria, así un
 *    ataque no llega a la base.
 */
const buckets = new Map<string, { count: number; start: number }>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k)
  }
  const b = buckets.get(key)
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { count: 1, start: now })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

/** Correo (u otro dato personal) resumido para usarlo como clave sin guardarlo en claro. */
export const hashKey = (value: string) => createHash('sha256').update(value.trim().toLowerCase(), 'utf8').digest('base64url').slice(0, 32)

export type Limit = { key: string; max: number; windowMs: number }

/**
 * true si TODOS los límites todavía permiten el intento (y lo cuenta en cada
 * uno). Si la base falla, deja pasar: un error nuestro no debe impedir que la
 * gente entre (el filtro en memoria sigue funcionando).
 */
export async function limitShared(limits: Limit[]): Promise<boolean> {
  for (const l of limits) if (!rateLimit(l.key, l.max, l.windowMs)) return false
  try {
    const db = getServerSupabase()
    const results = await Promise.all(limits.map(l =>
      db.rpc('rate_limit_take', { p_key: l.key, p_max: l.max, p_window_seconds: Math.round(l.windowMs / 1000) })))
    for (const r of results) {
      if (r.error) throw r.error
      if (r.data === false) return false
    }
    return true
  } catch (error) {
    console.error('[limitShared]', (error as Error)?.message ?? error)
    return true
  }
}

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

/** Respuesta 429 con Retry-After (el cliente espera antes de reintentar). */
export function tooMany(message: string, retryAfterSeconds = 60): Response {
  return Response.json({ error: message, code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
}
