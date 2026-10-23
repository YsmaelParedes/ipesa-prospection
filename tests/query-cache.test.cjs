require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { QueryCache, QueryError } = require('../lib/queryCache.ts')
const { queryPolicy, normalizedPath, mutationResources } = require('../lib/queryPolicy.ts')
const policy = { staleTime: 30_000, maxAge: 600_000 }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('concurrent readers share one request and reuse fresh data', async () => {
  let calls = 0
  const cache = new QueryCache(), gate = deferred()
  const loader = () => { calls++; return gate.promise }
  const reads = Array.from({ length: 20 }, () => cache.read('contacts', loader, policy))
  await Promise.resolve()
  assert.equal(calls, 1)
  gate.resolve({ count: 3 })
  assert.deepEqual(await Promise.all(reads), Array(20).fill({ count: 3 }))
  await cache.read('contacts', loader, policy)
  assert.equal(calls, 1)
})

test('TTL and maximum stale age are distinct', async () => {
  let now = 1_000_000, calls = 0
  const cache = new QueryCache(() => now), loader = async () => ++calls
  await cache.read('a', loader, policy)
  now += 29_999
  assert.equal(await cache.read('a', loader, policy), 1)
  now++
  assert.equal(await cache.read('a', loader, policy), 2)
  now += 600_000
  assert.equal(cache.peek('a').data, undefined)
})

test('mutation invalidation rejects an older in-flight response', async () => {
  const cache = new QueryCache(), old = deferred()
  const first = cache.read('a', () => old.promise, policy)
  const rejected = assert.rejects(first, { name: 'AbortError' })
  await Promise.resolve()
  cache.invalidate(key => key === 'a')
  assert.equal(await cache.read('a', async () => 'new', policy), 'new')
  old.resolve('old')
  await rejected
  assert.equal(cache.peek('a').data, 'new')
})

test('context clear prevents a previous tenant response from returning', async () => {
  const cache = new QueryCache(), old = deferred()
  const first = cache.read('user-A/store-A', () => old.promise, policy)
  const rejected = assert.rejects(first, { name: 'AbortError' })
  await Promise.resolve()
  cache.clear()
  await cache.read('user-A/store-B', async () => 'B', policy)
  old.resolve('A')
  await rejected
  assert.equal(cache.peek('user-A/store-A'), undefined)
  assert.equal(cache.peek('user-A/store-B').data, 'B')
})

test('unmounting one consumer does not cancel the shared request', async () => {
  const cache = new QueryCache(), gate = deferred()
  const stopOne = cache.subscribe(k => k === 'a', () => {})
  const stopTwo = cache.subscribe(k => k === 'a', () => {})
  let signal
  const promise = cache.read('a', s => { signal = s; return gate.promise }, policy)
  await Promise.resolve(); stopOne()
  assert.equal(signal.aborted, false)
  gate.resolve(42)
  assert.equal(await promise, 42)
  stopTwo()
})

test('429 respects Retry-After; failures do not become successful empty lists', async () => {
  let now = 1_000_000, calls = 0
  const cache = new QueryCache(() => now)
  const fail = async () => { calls++; throw new QueryError('Limitado', 429, 60_000) }
  await assert.rejects(cache.read('a', fail, policy))
  assert.equal(cache.peek('a').data, undefined)
  now += 59_999
  await assert.rejects(cache.read('a', fail, policy))
  assert.equal(calls, 1)
  now++
  assert.equal(await cache.read('a', async () => 'ok', policy), 'ok')
})

test('403 removes previously authorized data', async () => {
  let now = 1_000_000
  const cache = new QueryCache(() => now)
  await cache.read('a', async () => 'private', policy)
  now += 30_000
  await assert.rejects(cache.read('a', async () => { throw new QueryError('Forbidden', 403) }, policy))
  assert.equal(cache.peek('a').data, undefined)
})

test('financial data expires after one minute even when refresh fails', async () => {
  let now = 1_000_000
  const cache = new QueryCache(() => now), p = queryPolicy('/api/billing/usage')
  await cache.read('payments', async () => 100, p)
  const stop = cache.subscribe(k => k === 'payments', () => {})
  now += 60_000
  assert.equal(cache.expired(), true, 'legacy view state must be hidden even before a refresh fails')
  await assert.rejects(cache.read('payments', async () => { throw new Error('offline') }, p))
  assert.equal(cache.peek('payments').data, undefined)
  stop()
})

test('only mounted resources poll; focus refresh respects TTL', async () => {
  let now = 1_000_000
  const cache = new QueryCache(() => now), p = queryPolicy('/api/data/reminders')
  await cache.read('reminders', async () => [], p)
  now += 60_000
  assert.deepEqual(cache.refreshable(), [])
  const stop = cache.subscribe(k => k === 'reminders', () => {})
  assert.deepEqual(cache.refreshable(), ['reminders'])
  await cache.read('reminders', async () => [], p)
  assert.deepEqual(cache.refreshable(true), [])
  stop()
})

test('inactive entries are bounded and evicted without removing mounted ones', async () => {
  let now = 1_000_000
  const cache = new QueryCache(() => now)
  const stop = cache.subscribe(k => k === 'mounted', () => {})
  await cache.read('mounted', async () => 1, policy)
  for (let i = 0; i < 150; i++) await cache.read(String(i), async () => i, policy)
  assert.equal(cache.size, 101)
  now += 600_000; cache.prune()
  assert.equal(cache.size, 1)
  stop()
})

test('normalization, side-effect exclusions and mutation dependencies', () => {
  assert.equal(normalizedPath('/api/data/leads?phone=123&contact_id=1'), '/api/data/leads?contact_id=1&phone=123')
  assert.equal(queryPolicy('/api/whatsapp/conversations/1234567890'), null)
  assert.equal(queryPolicy('/api/data/export'), null)
  assert.equal(queryPolicy('/api/whatsapp/media/123'), null)
  assert.ok(mutationResources('/api/data/reminders/123').includes('/api/data/leads'))
  assert.ok(mutationResources('/api/whatsapp/campaigns/send').includes('/api/data/dashboard'))
})
