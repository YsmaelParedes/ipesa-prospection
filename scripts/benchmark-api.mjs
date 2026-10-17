/** Read-only API benchmark. Does not measure browser rendering or client memory-cache hits. */
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

const base = new URL(process.env.CRM_BENCH_URL || 'http://localhost:3000')
const cookie = process.env.CRM_BENCH_COOKIE
if (!cookie) throw new Error('Falta CRM_BENCH_COOKIE: usa una sesión de prueba. No se miden respuestas sin autenticar.')
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Las sesiones remotas requieren HTTPS.')
const headers = { Cookie: cookie }
const identity = await fetch(new URL('/api/me', base), { headers, redirect: 'error' })
if (!identity.ok) throw new Error(`La sesión de prueba no está disponible (${identity.status}).`)
const session = await identity.json()
const paths = session.store ? ['/api/data/dashboard?includeWhatsApp=0', '/api/data/contacts', '/api/data/leads', '/api/data/reminders', '/api/data/config'] : []
if (session.store?.modules?.formulas) paths.push('/api/formulas')
if (session.store?.modules?.whatsapp) paths.push('/api/whatsapp/conversations?filter=all', '/api/whatsapp/unread')
if (session.isAdmin && session.store?.modules?.campaigns) paths.push('/api/whatsapp/campaigns/stats', '/api/whatsapp/campaigns/history?days=30')
if (session.isAdmin && session.store) paths.push('/api/store', '/api/store/members')
if (session.platformAdmin && process.env.CRM_BENCH_ADMIN === '1') {
  const now = new Date(), month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  paths.push('/api/platform/stores', `/api/platform/payments?month=${month}`)
}
const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)]
const results = []
for (const path of paths) {
  const samples = []
  for (let sample = 0; sample < 20; sample++) {
    const start = performance.now()
    const response = await fetch(new URL(path, base), { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) })
    const headersMs = performance.now() - start
    if (!response.ok) throw new Error(`Medición detenida: ${path.split('?')[0]} respondió ${response.status}.`)
    const body = await response.arrayBuffer()
    samples.push({ headersMs, totalMs: performance.now() - start, decodedBytes: body.byteLength, serverTiming: response.headers.get('Server-Timing') })
    // Remain below the API's 120/minute per-IP limit, leaving room for the UI.
    await delay(1000)
  }
  results.push({ route: path.split('?')[0], samples, medianMs: quantile(samples.map(s => s.totalMs), .5), p95Ms: quantile(samples.map(s => s.totalMs), .95) })
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), mode: 'authenticated-api-network-only', browserNavigationMeasured: false, results }, null, 2))
