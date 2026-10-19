require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PLANS, DEFAULT_MODULES, effectivePlan, effectiveModules, normalizeModules, storeAccess, planOf } = require('../lib/stores.ts')
const { planFromLookupKey, subscriptionSnapshot, subscriptionGivesPlan, formatPlanPrice } = require('../lib/billing.ts')
const { parsePlanLimitError, remainingSlots, planLimitMessage } = require('../lib/planLimits.ts')

const DAY = 86_400_000
const NOW = Date.parse('2026-10-18T12:00:00Z')

test('the plans match what was agreed', () => {
  assert.deepEqual([PLANS.litro.maxUsers, PLANS.galon.maxUsers, PLANS.cubeta.maxUsers], [1, 3, 5])
  assert.equal(PLANS.litro.maxContacts, 50)
  assert.equal(PLANS.litro.maxLeads, 10)
  assert.equal(PLANS.galon.whatsapp, false)
  assert.equal(PLANS.cubeta.whatsapp, true)
  assert.equal(planOf('profesional').label, 'Litro', 'unknown plans fall back to Litro')
})

test('a manual paid plan drops to Litro only after the grace days', () => {
  const at = days => new Date(NOW - days * DAY).toISOString()
  assert.equal(effectivePlan({ plan: 'cubeta', paid_until: at(2) }, NOW), 'cubeta')
  assert.equal(effectivePlan({ plan: 'cubeta', paid_until: at(4) }, NOW), 'litro')
  assert.equal(effectivePlan({ plan: 'galon', paid_until: null }, NOW), 'galon', 'Stripe and no-expiry courtesies never lapse')
  assert.equal(effectivePlan({ plan: 'interno', paid_until: at(400) }, NOW), 'interno')
})

test('new stores get neither campaigns nor formulas', () => {
  assert.deepEqual(DEFAULT_MODULES, { whatsapp: false, campaigns: false, formulas: false })
  assert.equal(normalizeModules({ whatsapp: true }).formulas, false)
  const ipesa = { whatsapp: true, campaigns: true, formulas: true }
  assert.deepEqual(effectiveModules({ plan: 'interno', paid_until: null, modules: ipesa }, NOW), ipesa)
  // Cubeta trae la bandeja, no las campañas
  assert.deepEqual(effectiveModules({ plan: 'cubeta', paid_until: null, modules: { whatsapp: true } }, NOW),
    { whatsapp: true, campaigns: false, formulas: false })
  // Campañas solo encima de WhatsApp
  assert.equal(effectiveModules({ plan: 'galon', paid_until: null, modules: ipesa }, NOW).campaigns, false)
})

test('WhatsApp needs the Cubeta plan and the advisor switch', () => {
  const on = { whatsapp: true, campaigns: true, formulas: true }
  assert.equal(effectiveModules({ plan: 'cubeta', paid_until: null, modules: on }, NOW).whatsapp, true)
  assert.equal(effectiveModules({ plan: 'galon', paid_until: null, modules: on }, NOW).whatsapp, false)
  assert.equal(effectiveModules({ plan: 'cubeta', paid_until: null, modules: { ...on, whatsapp: false } }, NOW).whatsapp, false)
})

test('only suspended or cancelled stores are read-only', () => {
  for (const status of ['active', 'pending', 'trial']) assert.equal(storeAccess({ status }), 'full')
  for (const status of ['suspended', 'cancelled']) assert.equal(storeAccess({ status }), 'readonly')
})

test('Stripe prices and subscriptions map to plans', () => {
  assert.equal(planFromLookupKey('galon_mensual'), 'galon')
  assert.equal(planFromLookupKey('cubeta_mensual'), 'cubeta')
  assert.equal(planFromLookupKey('otro'), null)
  const snap = subscriptionSnapshot({
    id: 'sub_1', status: 'active', customer: { id: 'cus_1' }, cancel_at_period_end: true,
    metadata: { store_id: 'abc' },
    items: { data: [{ current_period_end: 1_800_000_000, price: { lookup_key: 'cubeta_mensual' } }] },
  })
  assert.deepEqual(snap, {
    subscriptionId: 'sub_1', customerId: 'cus_1', status: 'active', plan: 'cubeta',
    periodEnd: new Date(1_800_000_000 * 1000).toISOString(), cancelAtPeriodEnd: true, storeId: 'abc',
  })
  // Cancelar desde el portal (API actual): cancel_at con la fecha de término
  const ending = subscriptionSnapshot({
    id: 'sub_2', status: 'active', customer: 'cus_2', cancel_at_period_end: false, cancel_at: 1_790_000_000,
    items: { data: [{ current_period_end: 1_790_000_000, price: { lookup_key: 'galon_mensual' } }] },
  })
  assert.equal(ending.cancelAtPeriodEnd, true)
  assert.equal(ending.periodEnd, new Date(1_790_000_000 * 1000).toISOString())
  for (const s of ['active', 'trialing', 'past_due']) assert.equal(subscriptionGivesPlan(s), true)
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', null]) assert.equal(subscriptionGivesPlan(s), false)
  assert.equal(formatPlanPrice({ amount: 499, currency: 'mxn', interval: 'month' }), '$499')
})

test('the database limit error becomes a clear message', () => {
  assert.deepEqual(parsePlanLimitError({ code: 'P0001', message: 'PLAN_LIMIT:contacts:50' }), { kind: 'contacts', limit: 50 })
  assert.equal(parsePlanLimitError({ code: '23505', message: 'duplicate key' }), null)
  assert.match(planLimitMessage('leads', 10), /10 leads del plan Litro/)
  assert.equal(remainingSlots(50, 48), 2)
  assert.equal(remainingSlots(50, 60), 0)
  assert.equal(remainingSlots(null, 999), null)
})
