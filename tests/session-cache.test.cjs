const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
require('./register-typescript.cjs')
const stores = require('../lib/stores.ts')

// Caché corta de sesión y tienda (lib/supabase-server.ts): cuántas veces se
// valida el token contra Supabase Auth y se leen las membresías.
function setup({ now = 1_000_000 } = {}) {
  const state = {
    now, token: 'token-a', expiresAt: (now + 3_600_000) / 1000,
    authCalls: 0, memberCalls: 0, authFails: false, cookie: undefined,
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.token ? { access_token: state.token, expires_at: state.expiresAt } : null } }),
      getUser: async token => {
        state.authCalls++
        await new Promise(r => setImmediate(r))
        return state.authFails ? { data: { user: null }, error: new Error('invalid') } : { data: { user: { id: `user-${token}`, email: 'a@b.mx' } }, error: null }
      },
    },
  }
  const membershipQuery = {
    select() { return this }, eq() { return this },
    order: async () => {
      state.memberCalls++
      await new Promise(r => setImmediate(r))
      return { data: [{ store_id: 'store-1', role: 'admin', created_at: '2026-01-01', stores: { id: 'store-1', plan: 'cubeta', status: 'active', paid_until: null, modules: {}, timezone: 'America/Mexico_City' } }], error: null }
    },
  }
  const source = fs.readFileSync(path.join(__dirname, '../lib/supabase-server.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  const mocks = {
    'node:crypto': require('node:crypto'),
    './serverTiming': { databaseFetch: fetch, measure: (_, fn) => fn() },
    '@supabase/ssr': { createServerClient: () => client },
    '@supabase/supabase-js': { createClient: () => ({ from: () => membershipQuery }) },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {}, get: () => state.cookie }) },
    './sessionCookie': { SESSION_COOKIE_OPTIONS: {} },
    './stores': stores,
  }
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(id) { if (Object.hasOwn(mocks, id)) return mocks[id]; throw new Error(`Unmocked import: ${id}`) },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_KEY: 'service' } },
    console: { error() {}, warn() {} }, Date: { now: () => state.now }, Map, Set, Promise, Response, Math, JSON, Object, Array, String, Number, Error,
  }, { filename: 'lib/supabase-server.ts' })
  return { api: module.exports, state }
}

test('una pantalla con varias peticiones a la vez valida la sesión una sola vez', async () => {
  const { api, state } = setup()
  const users = await Promise.all([1, 2, 3, 4, 5].map(() => api.getSessionUser()))
  assert.equal(state.authCalls, 1)
  assert.ok(users.every(u => u.id === 'user-token-a'))
  await api.getSessionUser()
  assert.equal(state.authCalls, 1, 'dentro de 30 s no se vuelve a validar')
  state.now += 30_000
  await api.getSessionUser()
  assert.equal(state.authCalls, 2, 'a los 30 s se vuelve a validar')
})

test('cada token se valida por separado y sin sesión no se llama a Auth', async () => {
  const { api, state } = setup()
  await api.getSessionUser()
  state.token = 'token-b'
  assert.equal((await api.getSessionUser()).id, 'user-token-b')
  assert.equal(state.authCalls, 2)
  state.token = null
  assert.equal(await api.getSessionUser(), null)
  assert.equal(state.authCalls, 2)
})

test('un token rechazado no se guarda; fresh y forgetSessionUser obligan a validar otra vez', async () => {
  const { api, state } = setup()
  state.authFails = true
  assert.equal(await api.getSessionUser(), null)
  state.authFails = false
  assert.ok(await api.getSessionUser())
  assert.equal(state.authCalls, 2)
  await api.getSessionUser({ fresh: true })
  assert.equal(state.authCalls, 3)
  await api.forgetSessionUser()
  await api.getSessionUser()
  assert.equal(state.authCalls, 4)
  // Un rechazo tras el fresh tampoco deja un usuario guardado
  state.authFails = true
  assert.equal(await api.getSessionUser({ fresh: true }), null)
  assert.equal(await api.getSessionUser(), null)
})

test('la validación nunca dura más que el token', async () => {
  const { api, state } = setup()
  state.expiresAt = (state.now + 5_000) / 1000
  await api.getSessionUser()
  state.now += 5_000
  await api.getSessionUser()
  assert.equal(state.authCalls, 2)
  // Ya vencido: se valida en cada petición (Auth lo rechaza o la sesión se renueva)
  await api.getSessionUser()
  assert.equal(state.authCalls, 3)
})

test('membresías: 10 s en caché, compartidas entre peticiones simultáneas y borradas al cambiar el equipo', async () => {
  const { api, state } = setup()
  const user = { id: 'user-token-a' }  // el mismo que valida la sesión (requireStore)
  const [a, b] = await Promise.all([api.resolveStoreContext(user), api.resolveStoreContext(user)])
  assert.equal(a.storeId, 'store-1'); assert.equal(b.storeId, 'store-1')
  assert.equal(state.memberCalls, 1)
  await api.requireStore()
  state.now += 9_000
  await api.resolveStoreContext(user)
  assert.equal(state.memberCalls, 1)
  state.now += 1_000
  await api.resolveStoreContext(user)
  assert.equal(state.memberCalls, 2, 'a los 10 s se vuelven a leer')
  api.invalidateStoreMembers('store-1')
  await api.resolveStoreContext(user)
  assert.equal(state.memberCalls, 3, 'un cambio de equipo se ve al momento')
  api.invalidateStoreContextCache()
  await api.resolveStoreContext(user)
  assert.equal(state.memberCalls, 4)
})
