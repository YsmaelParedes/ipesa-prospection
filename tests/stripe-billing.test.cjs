const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const Stripe = require('stripe')
require('./register-typescript.cjs')
const billing = require('../lib/billing.ts')
const stores = require('../lib/stores.ts')

// Explicit import allowlist: tests cannot accidentally instantiate real DB or
// payment clients. Environment contains only dummy signing credentials.
function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id === 'node:crypto') return require(id)
      throw new Error(`Unmocked import: ${id}`)
    },
    process: { env: { STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_dummy' } },
    console: { error() {}, warn() {} }, TextDecoder, Date, Set,
  }, { filename: file })
  return module.exports
}
function query(result) {
  const chain = { select() { return chain }, eq() { return chain }, is() { return chain },
    single: async () => result, maybeSingle: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
  return chain
}

const STORE = '11111111-1111-4111-8111-111111111111'
const fakeSub = status => ({ id: 'sub_dummy', status, customer: 'cus_dummy', metadata: { store_id: STORE, plan: 'cubeta' },
  cancel_at_period_end: false, items: { data: [{ current_period_end: 1800000000, price: { id: 'price_old', lookup_key: null } }] } })

test('sync re-reads Stripe after acquiring the store lock and uses historical prices, not stale metadata', async () => {
  const steps = []; let reads = 0; let applied
  const db = { from: () => query({ data: { id: STORE, stripe_customer_id: 'cus_dummy' }, error: null }),
    rpc: async (_, args) => { steps.push('apply'); applied = args; return { data: { plan: 'litro', prev_plan: 'galon' }, error: null } } }
  const { syncSubscription } = load('lib/stripeSync.ts', {
    './supabase-server': { getServerSupabase: () => db },
    './stripe': { getStripe: () => ({ subscriptions: { retrieve: async () => { steps.push('read'); return fakeSub(++reads === 1 ? 'active' : 'canceled') } } }), planForPrice: async () => 'galon' },
    './stripeBillingState': { withStripeStoreLock: async (_, work) => { steps.push('lock'); return work('token') } },
    './billing': billing, './stores': stores, './brand': { APP_NAME: 'Test' },
  })
  await syncSubscription('sub_dummy')
  assert.deepEqual(steps, ['read', 'lock', 'read', 'apply'])
  assert.equal(applied.p_status, 'canceled')
  assert.equal(applied.p_plan, 'galon')
  assert.equal(applied.p_lock, 'token')
})

test('store lookup errors throw (retry); subscriptions of no store are skipped without locking', async () => {
  const mk = result => load('lib/stripeSync.ts', {
    './supabase-server': { getServerSupabase: () => ({ from: () => query(result) }) },
    './stripe': { getStripe: () => ({ subscriptions: { retrieve: async () => fakeSub('active') } }) },
    './stripeBillingState': { withStripeStoreLock: () => assert.fail('must not lock/apply') },
    './billing': billing, './stores': stores, './brand': { APP_NAME: 'Test' },
  }).syncSubscription
  await assert.rejects(mk({ data: null, error: new Error('DB unavailable') })('sub_dummy'), /DB unavailable/)
  // Otra suscripción de la misma cuenta de Stripe (no es de Matices): se reconoce y no se reintenta
  const skipped = await mk({ data: null, error: null })('sub_dummy')
  assert.equal(skipped.ok, false)
  assert.equal(skipped.reason, 'Suscripción sin tienda')
})

test('price mapping survives removal of the lookup key and rejects conflicting reassignment', async () => {
  const history = new Map()
  const db = { from: () => ({
    upsert: async row => { if (!history.has(row.price_id)) history.set(row.price_id, row.plan); return { error: null } },
    select: () => ({ eq: (_, id) => query({ data: history.has(id) ? { plan: history.get(id) } : null, error: null }) }),
  }) }
  const api = load('lib/stripe.ts', { stripe: class {}, './billing': billing, './supabase-server': { getServerSupabase: () => db } })
  assert.equal(await api.planForPrice({ id: 'price_old', lookup_key: 'galon_mensual' }), 'galon')
  assert.equal(await api.planForPrice({ id: 'price_old', lookup_key: null }), 'galon')
  assert.equal(await api.planForPrice({ id: 'price_new', lookup_key: 'galon_mensual' }), 'galon')
  await assert.rejects(api.rememberPricePlan('price_old', 'cubeta'), /otro plan/)
  assert.equal(await api.planForPrice({ id: 'price_unknown', lookup_key: null }), null)
})

function webhookHarness({ claim = { status: 'claimed', token: 'token' }, claimError = null, failSync = false, completed = true } = {}) {
  const calls = []; let syncs = 0
  const sdk = new Stripe('sk_test_dummy')
  const { POST } = load('app/api/webhooks/stripe/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) }, after: () => {} },
    '@/lib/boundedBody': { readBoundedBody: async () => Buffer.from(JSON.stringify({ id: 'evt_dummy', type: 'customer.subscription.updated', data: { object: { id: 'sub_dummy' } } })) },
    '@/lib/supabase-server': { getServerSupabase: () => ({ rpc: async (name, args) => {
      calls.push({ name, args })
      return name === 'claim_stripe_event' ? { data: claim, error: claimError } : { data: completed, error: null }
    } }) },
    '@/lib/stripe': { getStripe: () => sdk },
    '@/lib/stripeSync': { syncSubscription: async () => { syncs++; if (failSync) throw new Error('DB unavailable'); return { ok: true, storeId: STORE } } },
    '@/lib/errorReport': { reportError() {} },
  })
  const payload = JSON.stringify({ id: 'evt_dummy', type: 'customer.subscription.updated', data: { object: { id: 'sub_dummy' } } })
  const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: 'whsec_dummy' })
  return { calls, syncs: () => syncs, run: (header = signature) => POST({ body: null, headers: new Headers({ 'stripe-signature': header }) }) }
}

test('forged webhook signatures are rejected before any DB access', async () => {
  const h = webhookHarness()
  assert.equal((await h.run('t=1,v1=invalid')).status, 400)
  assert.equal(h.calls.length, 0)
})
test('busy events return retryable status; only completed events are acknowledged as duplicates', async () => {
  for (const [status, code] of [['busy', 503], ['processed', 200]]) {
    const h = webhookHarness({ claim: { status } })
    assert.equal((await h.run()).status, code)
    assert.equal(h.syncs(), 0)
    assert.equal(h.calls.length, 1)
  }
})
test('claim errors and failed syncs produce 500 without marking an event processed', async () => {
  const unavailable = webhookHarness({ claimError: new Error('DB unavailable') })
  assert.equal((await unavailable.run()).status, 500)
  assert.equal(unavailable.syncs(), 0)
  const failed = webhookHarness({ failSync: true })
  assert.equal((await failed.run()).status, 500)
  assert.equal(failed.calls.at(-1).args.p_success, false)
  assert.equal(failed.calls.some(c => c.args.p_success === true), false)
})
test('successful webhook completion is fenced by its claim token', async () => {
  const good = webhookHarness()
  assert.equal((await good.run()).status, 200)
  assert.equal(good.calls.at(-1).args.p_token, 'token')
  assert.equal(good.calls.at(-1).args.p_success, true)
  const expired = webhookHarness({ completed: false })
  assert.equal((await expired.run()).status, 500)
})

function checkoutHarness() {
  const state = { checkout_attempt: null, checkout_params: null, checkout_session: null }
  const store = { stripe_customer_id: 'cus_dummy', plan: 'litro', status: 'active' }
  const sessions = new Map(); const byKey = new Map(); const requests = []
  let subscriptions = []; let loseResponse = false; let holding = false; let onList = null
  const stripe = {
    subscriptions: {
      list: () => ({ async *[Symbol.asyncIterator]() { for (const s of subscriptions) yield s } }),
      retrieve: async id => subscriptions.find(s => s.id === id) ?? { id, status: 'canceled' },
    },
    checkout: { sessions: {
      create: async (params, options) => {
        requests.push({ params: structuredClone(params), key: options.idempotencyKey })
        let session = byKey.get(options.idempotencyKey)
        if (!session) {
          const id = `cs_${sessions.size + 1}`
          session = { id, status: 'open', mode: 'subscription', customer: params.customer,
            metadata: structuredClone(params.metadata), url: `https://checkout.stripe.test/${id}` }
          sessions.set(id, session); byKey.set(options.idempotencyKey, session)
        }
        if (loseResponse) { loseResponse = false; throw new Error('response lost') }
        return structuredClone(session)
      },
      retrieve: async id => structuredClone(sessions.get(id)),
      expire: async id => { const s = sessions.get(id); if (s.status !== 'open') throw new Error('already completed'); s.status = 'expired'; return s },
      list: async args => { if (onList) onList(); return { has_more: false, data: [...sessions.values()].filter(s => !args.status || s.status === args.status) } },
    } },
  }
  const db = {
    from: table => query({ data: structuredClone(table === 'stores' ? store : state), error: null }),
    rpc: async (name, args) => {
      assert.equal(name, 'save_stripe_checkout')
      Object.assign(state, args.p_clear ? { checkout_attempt: null, checkout_params: null, checkout_session: null }
        : { checkout_attempt: args.p_attempt, checkout_params: structuredClone(args.p_params), checkout_session: args.p_session })
      return { error: null }
    },
  }
  const { openStripeCheckout } = load('lib/stripeCheckout.ts', {
    './supabase-server': { getServerSupabase: () => db },
    './stripe': { getStripe: () => stripe, priceIdFor: async plan => `price_${plan}` },
    './stripeBillingState': {
      assertStripeStoreLock: async () => {},
      withStripeStoreLock: async (_, work) => {
        if (holding) throw new Error('busy'); holding = true
        try { return await work('token') } finally { holding = false }
      },
    },
  })
  return { state, sessions, requests, run: (plan = 'galon') => openStripeCheckout({ storeId: STORE }, plan, 'https://app.test'),
    loseNextResponse: () => { loseResponse = true }, setSubscriptions: values => { subscriptions = values },
    onList: fn => { onList = fn } }
}

test('double clicks reuse one pending Checkout and concurrent requests cannot create a second', async () => {
  const h = checkoutHarness()
  const results = await Promise.allSettled([h.run(), h.run()])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  const url = await h.run()
  assert.equal(url, results.find(r => r.status === 'fulfilled').value)
  assert.equal(h.sessions.size, 1)
  assert.equal(h.requests.length, 1)
})
test('lost Stripe responses retry the persisted idempotency key and exact payload', async () => {
  const h = checkoutHarness(); h.loseNextResponse()
  await assert.rejects(h.run(), /response lost/)
  assert.ok(h.state.checkout_attempt)
  assert.equal(h.state.checkout_session, null)
  const first = h.requests[0]
  await h.run()
  assert.deepEqual(h.requests[1], first)
  assert.equal(h.sessions.size, 1)
})
test('older lost responses reconcile the existing session instead of changing its expiry or retrying create', async () => {
  const h = checkoutHarness(); h.loseNextResponse()
  await assert.rejects(h.run(), /response lost/)
  h.state.checkout_params.expires_at = Math.floor(Date.now() / 1000) + 1200
  await h.run()
  assert.equal(h.requests.length, 1)
  assert.equal(h.state.checkout_session, 'cs_1')
})
test('an expired uncreated attempt is replaced, but an unresolved unexpired attempt is retained', async () => {
  const h = checkoutHarness()
  Object.assign(h.state, { checkout_attempt: STORE, checkout_params: { expires_at: Math.floor(Date.now() / 1000) + 1200 } })
  await assert.rejects(h.run(), /aún está pendiente/)
  assert.equal(h.state.checkout_attempt, STORE)
  assert.equal(h.requests.length, 0)
  h.state.checkout_params.expires_at = Math.floor(Date.now() / 1000) - 1
  await h.run()
  assert.notEqual(h.state.checkout_attempt, STORE)
  assert.equal(h.requests.length, 1)
})
test('changing plan expires the old payment link before creating another', async () => {
  const h = checkoutHarness()
  await h.run('galon')
  await h.run('cubeta')
  assert.equal(h.sessions.get('cs_1').status, 'expired')
  assert.equal(h.sessions.get('cs_2').status, 'open')
  assert.equal(h.requests[1].params.line_items[0].price, 'price_cubeta')
  assert.notEqual(h.requests[0].key, h.requests[1].key)
})
test('an existing active, unpaid, paused or incomplete subscription blocks a new Checkout', async () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
    const h = checkoutHarness(); h.setSubscriptions([{ id: 'sub_other', status }])
    await assert.rejects(h.run(), /Ya tienes una suscripción/)
    assert.equal(h.requests.length, 0)
  }
})
test('a legacy Checkout completed during reconciliation cannot cause a duplicate subscription', async () => {
  const h = checkoutHarness()
  h.onList(() => h.setSubscriptions([{ id: 'sub_legacy', status: 'active' }]))
  await assert.rejects(h.run(), /Ya tienes una suscripción/)
  assert.equal(h.requests.length, 0)
})
