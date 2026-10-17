import { AsyncLocalStorage } from 'node:async_hooks'

type Timing = Map<string, number>
const timings = new AsyncLocalStorage<Timing>()

export async function measure<T>(name: 'auth' | 'store' | 'database' | 'external', work: () => PromiseLike<T>): Promise<T> {
  const ctx = timings.getStore()
  if (!ctx) return await work()
  const start = performance.now()
  try { return await work() } finally { ctx.set(name, (ctx.get(name) ?? 0) + performance.now() - start) }
}

export const databaseFetch: typeof fetch = (input, init) => measure('database', () => fetch(input, init))
export const externalFetch: typeof fetch = (input, init) => measure('external', () => fetch(input, init))

/** Durations contain no URLs, SQL, user IDs or other private information. */
export function withServerTiming<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return (...args: A): Promise<Response> => timings.run(new Map(), async () => {
    const start = performance.now()
    const response = await handler(...args)
    const entries = [...timings.getStore()!, ['total', performance.now() - start] as const]
    response.headers.set('Server-Timing', entries.map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(', '))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  })
}
