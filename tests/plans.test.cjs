require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PLANS, DEFAULT_MODULES, effectivePlan, effectiveModules, normalizeModules, storeAccess, planOf } = require('../lib/stores.ts')
const { planFromLookupKey, subscriptionSnapshot, subscriptionGivesPlan, formatPlanPrice } = require('../lib/billing.ts')
const { parsePlanLimitError, remainingSlots, planLimitMessage } = require('../lib/planLimits.ts')

const DAY = 86_400_000
const NOW = Date.parse('2026-10-18T12:00:00Z')

test('the plans match what was agreed', () => {
  assert.deepEqual([PLANS.litro.maxUsers, PLANS.galon.maxUsers, PLANS.cubeta.maxUsers], [1, 3, 10])
  assert.equal(PLANS.litro.maxContacts, 50)
  assert.equal(PLANS.galon.whatsapp, false)
  assert.equal(PLANS.cubeta.whatsapp, true)
  assert.deepEqual([PLANS.litro.reports, PLANS.galon.reports, PLANS.cubeta.reports, PLANS.interno.reports], [false, false, true, true])
  // Metas propias por vendedor: solo Cubeta e Interno; en Galón todo el equipo usa la de la tienda
  assert.deepEqual([PLANS.litro.sellerGoals, PLANS.galon.sellerGoals, PLANS.cubeta.sellerGoals, PLANS.interno.sellerGoals], [false, false, true, true])
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
  assert.match(planLimitMessage('contacts', 50), /50 contactos del plan Litro/)
  assert.equal(remainingSlots(50, 48), 2)
  assert.equal(remainingSlots(50, 60), 0)
  assert.equal(remainingSlots(null, 999), null)
})

test('avisos push: en Litro solo el administrador principal; con plan de equipo, todos', () => {
  const { audienceUsers, mainAdminOf } = require('../lib/stores.ts')
  const members = [
    { user_id: 'a-old', role: 'admin' },
    { user_id: 'creator', role: 'admin' },
    { user_id: 'seller', role: 'employee' },
  ]
  const litro = { plan: 'litro', paid_until: null, created_by: 'creator' }
  assert.deepEqual(audienceUsers(litro, members, NOW), ['creator'])
  // Si quien abrió la tienda ya no es administrador activo, el más antiguo
  assert.deepEqual(audienceUsers({ ...litro, created_by: 'gone' }, members, NOW), ['a-old'])
  assert.deepEqual(audienceUsers(litro, [{ user_id: 'seller', role: 'employee' }], NOW), [])
  assert.deepEqual(audienceUsers({ plan: 'galon', paid_until: null, created_by: 'creator' }, members, NOW), ['a-old', 'creator', 'seller'])
  // Cortesía vencida cuenta como Litro: el equipo deja de recibir avisos
  const expired = { plan: 'cubeta', paid_until: new Date(NOW - 10 * DAY).toISOString(), created_by: 'creator' }
  assert.deepEqual(audienceUsers(expired, members, NOW), ['creator'])
  assert.equal(mainAdminOf(null, []), null)
})

test('the Acumulado report has one row per seller, the store total and the comparison', () => {
  const { summaryPeopleRows, summaryTotalsRows } = require('../lib/exportData.ts')
  const counts = (calls, sold) => ({ calls, effective: 1, quotes: 2, followups: 3, sales: 4, quoted: 100, sold })
  const goals = { calls: 30, effective: 15, quotes: 6, followups: 10, sales: 2 }
  const data = {
    period: 'week', from: '2026-11-02', end: '2026-11-04',
    totals: counts(12, 500), prev: counts(8, 200), goals, compliance: 0.5, prevCompliance: 0.256,
    people: [{ name: 'Ana', counts: counts(10, 300), goals, compliance: 0.64 }],
  }
  const rows = summaryPeopleRows(data)
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Vendedor'], 'Ana')
  assert.equal(rows[0]['Llamadas'], 10)
  assert.equal(rows[0]['Monto vendido'], 300)
  assert.equal(rows[0]['Cumplimiento %'], 64)
  assert.equal(rows[1]['Vendedor'], 'Total de la tienda')
  assert.equal(rows[1]['Monto vendido'], 500)
  const totals = summaryTotalsRows(data)
  assert.deepEqual(totals[0], { 'Indicador': 'Llamadas', 'Este periodo': 12, 'Periodo anterior': 8, 'Meta': 30 })
  assert.deepEqual(totals.at(-1), { 'Indicador': 'Cumplimiento %', 'Este periodo': 50, 'Periodo anterior': 26, 'Meta': 100 })
})
