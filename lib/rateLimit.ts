/**
 * Límite de intentos en memoria por clave (IP + acción). Se reinicia con
 * cada arranque en frío; suficiente para frenar fuerza bruta casual. Para
 * algo persistente entre instancias usar @upstash/ratelimit.
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
