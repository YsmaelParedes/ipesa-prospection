require('./register-typescript.cjs')
const { test, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const realNow = Date.now, realFetch = global.fetch, realInterval = global.setInterval
let clock = 1_000_000
Date.now = () => clock
const timers = []
global.setInterval = fn => { timers.push(fn); return timers.length }
global.window = new EventTarget()
window.location = { pathname: '/contactos', replace: () => {}, reload: () => {} }
global.document = new EventTarget()
document.visibilityState = 'visible'
Object.defineProperty(global, 'navigator', { configurable: true, value: { connection: { saveData: false } } })
const messages = [], channels = []
global.BroadcastChannel = class {
  constructor() { channels.push(this) }
  postMessage(message) { messages.push(message) }
}
let session, calls, handler
const api = require('../lib/apiClient.ts')
const profile = require('../lib/profile.ts')
const response = data => Response.json(data)
const settle = () => new Promise(resolve => setImmediate(resolve))

beforeEach(() => {
  clock += 1_000_000
  session = { user: { id: 'u1' }, store: { id: 's1', modules: { formulas: true }, access: 'full' }, role: 'admin' }
  calls = []; messages.length = 0
  handler = async () => response({ contacts: [{ id: 'one' }] })
  global.fetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    if (url === '/api/me') return response(session)
    return handler(url, init)
  }
  api.clearQueryCache(); profile.invalidateSession(false)
  document.visibilityState = 'visible'; navigator.connection.saveData = false
})
after(() => { Date.now = realNow; global.fetch = realFetch; global.setInterval = realInterval })

test('adapter resolves session first, deduplicates requests, and returns independent response bodies', async () => {
  const result = await Promise.all(Array.from({ length: 20 }, () => api.apiFetch('/api/data/contacts')))
  assert.equal(calls.filter(c => c.url === '/api/me').length, 1)
  assert.equal(calls.filter(c => c.url === '/api/data/contacts').length, 1)
  assert.deepEqual(await Promise.all(result.map(r => r.json())), Array(20).fill({ contacts: [{ id: 'one' }] }))
  await api.apiFetch('/api/data/contacts')
  assert.equal(calls.length, 2)
})

test('stale reads return immediately and share background refresh', async () => {
  await api.apiFetch('/api/data/contacts')
  clock += 30_001
  let finish
  handler = () => new Promise(resolve => { finish = () => resolve(response({ contacts: [{ id: 'two' }] })) })
  const stale = await api.apiFetch('/api/data/contacts')
  assert.equal((await stale.json()).contacts[0].id, 'one')
  await api.apiFetch('/api/data/contacts')
  assert.equal(calls.filter(c => c.url === '/api/data/contacts').length, 2)
  finish(); await settle()
  assert.equal((await (await api.apiFetch('/api/data/contacts')).json()).contacts[0].id, 'two')
})

test('batch writes invalidate once, including partial failures, without broadcasting rows', async () => {
  await api.apiFetch('/api/data/contacts')
  await assert.rejects(api.batchQueryChanges(async () => {
    await api.apiFetch('/api/data/contacts', { method: 'POST', body: '{}' })
    await api.apiFetch('/api/data/contacts', { method: 'POST', body: '{}' })
    throw new Error('third batch failed')
  }))
  assert.equal(messages.length, 1)
  assert.equal(messages[0].type, 'invalidate')
  assert.ok(messages[0].resources.includes('/api/data/contacts'))
  assert.equal(JSON.stringify(messages).includes('contacts":[{'), false)
  await api.apiFetch('/api/data/contacts')
  assert.equal(calls.filter(c => c.method === 'GET' && c.url === '/api/data/contacts').length, 2)
})

test('cross-tab invalidation only affects matching context and never echoes', async () => {
  await api.apiFetch('/api/data/contacts')
  const channel = channels[0]
  channel.onmessage({ data: { type: 'invalidate', scope: 'other', resources: ['/api/data/contacts'] } })
  assert.ok(api.queryCache.peek(api.queryKey('/api/data/contacts')).data)
  channel.onmessage({ data: { type: 'invalidate', scope: api.sessionScope(session), resources: ['/api/data/contacts'] } })
  assert.equal(api.queryCache.peek(api.queryKey('/api/data/contacts')).data, undefined)
  assert.equal(messages.length, 0)
})

test('changing store isolates data and rejects late responses', async () => {
  let finish
  handler = () => new Promise(resolve => { finish = () => resolve(response({ contacts: [{ id: 'old-store' }] })) })
  const pending = api.apiFetch('/api/data/contacts')
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await settle()
  session = { ...session, store: { ...session.store, id: 's2' } }
  profile.invalidateSession(false)
  await profile.loadSession()
  finish(); await rejected
  handler = async () => response({ contacts: [{ id: 'new-store' }] })
  assert.equal((await (await api.apiFetch('/api/data/contacts')).json()).contacts[0].id, 'new-store')
})

test('HTTP errors and Retry-After do not get cached as data', async () => {
  handler = async () => responseWithError()
  function responseWithError() { return new Response('{"error":"busy"}', { status: 429, headers: { 'Retry-After': '60' } }) }
  await assert.rejects(api.apiFetch('/api/data/contacts'), { status: 429 })
  clock += 50_000
  await assert.rejects(api.apiFetch('/api/data/contacts'), { status: 429 })
  assert.equal(calls.filter(c => c.url === '/api/data/contacts').length, 1)
  assert.equal(api.queryCache.peek(api.queryKey('/api/data/contacts')).data, undefined)
})

test('conversation read intent is single-flight only; previews never share its entry', async () => {
  const path = '/api/whatsapp/conversations/5555555555'
  await Promise.all([api.apiFetch(path, { headers: { 'x-crm-read': '1' } }), api.apiFetch(path, { headers: { 'x-crm-read': '1' } })])
  assert.equal(calls.filter(c => c.url === path).length, 1)
  await api.apiFetch(path, { headers: { 'x-crm-read': '1' } })
  assert.equal(calls.filter(c => c.url === path).length, 2)
  await api.apiFetch(path + '?preview=1')
  assert.equal(calls.filter(c => c.url.includes('preview=1')).length, 1)
})

test('prefetch ignores conversation reads, unapproved routes and save-data', async () => {
  api.prefetchQuery('/api/whatsapp/conversations/5555555555')
  api.prefetchQuery('/api/whatsapp/campaigns/send')
  navigator.connection.saveData = true
  api.prefetchQuery('/api/data/contacts')
  await settle()
  assert.equal(calls.length, 0)
})

test('hidden tabs do not poll; visible mounted reminders share a refresh', async () => {
  await api.apiFetch('/api/data/reminders')
  const stop = api.queryCache.subscribe(key => api.keyPath(key) === '/api/data/reminders', () => {})
  clock += 60_001
  document.visibilityState = 'hidden'; timers.forEach(fn => fn()); await settle()
  assert.equal(calls.filter(c => c.url === '/api/data/reminders').length, 1)
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); await settle()
  assert.equal(calls.filter(c => c.url === '/api/data/reminders').length, 2)
  stop()
})

test('prefetch limits active data requests to two', async () => {
  let active = 0, maximum = 0
  const release = []
  handler = () => new Promise(resolve => {
    maximum = Math.max(maximum, ++active)
    release.push(() => { active--; resolve(response({})) })
  })
  api.prefetchQuery('/api/data/contacts')
  api.prefetchQuery('/api/data/leads')
  api.prefetchQuery('/api/data/config')
  await settle()
  assert.equal(active, 2)
  release.shift()(); await settle()
  assert.equal(active, 2)
  while (release.length) release.shift()()
  await settle()
  assert.equal(maximum, 2)
})

test('explicit reload bypasses fresh cache; a server rejection cannot replace it with an empty success', async () => {
  await api.apiFetch('/api/data/contacts')
  handler = async () => new Response('{"error":"unavailable"}', { status: 500 })
  await assert.rejects(api.apiFetch('/api/data/contacts', { cache: 'reload' }), { status: 500 })
  assert.equal(api.cachedQueryData('/api/data/contacts').contacts[0].id, 'one')
  clock += 600_000
  assert.equal(api.cachedQueryData('/api/data/contacts'), undefined)
})

test('401 clears all cached private resources and starts the expired-session flow', async () => {
  await api.apiFetch('/api/data/contacts')
  let destination
  window.location.replace = value => { destination = value }
  handler = async () => new Response('{"error":"expired"}', { status: 401 })
  await assert.rejects(api.apiFetch('/api/data/leads'))
  assert.equal(api.queryCache.size, 0)
  assert.ok(destination.startsWith('/login?next='))
})

test('a role change invalidates cached data even when the user and store remain the same', async () => {
  await api.apiFetch('/api/data/leads')
  const previousKey = api.queryKey('/api/data/leads')
  session = { ...session, role: 'employee' }
  profile.invalidateSession(false)
  await profile.loadSession()
  assert.equal(api.queryCache.peek(previousKey), undefined)
  assert.notEqual(previousKey, api.queryKey('/api/data/leads'))
})

test('session broadcasts refresh identity without reloading other tabs; store/logout broadcasts reload', async () => {
  await api.apiFetch('/api/data/contacts')
  let reloads = 0
  window.location.reload = () => { reloads++ }
  channels[0].onmessage({ data: { type: 'session' } })
  assert.equal(reloads, 0)
  channels[0].onmessage({ data: { type: 'context' } })
  assert.equal(reloads, 1)
  assert.equal(api.queryCache.size, 0)
})
