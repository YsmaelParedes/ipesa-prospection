const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
require('./register-typescript.cjs')

// Correos del fin de la prueba de Cubeta (lib/trialNotices.ts): cuál toca y
// qué dice. Sin base ni Resend: solo las funciones puras.
function load() {
  const source = fs.readFileSync(path.join(__dirname, '../lib/trialNotices.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  const mocks = {
    './brand': require('../lib/brand.ts'),
    './legal': require('../lib/legal.ts'),
    './billing': require('../lib/billing.ts'),
    './stores': require('../lib/stores.ts'),
    './email': { emailConfigured: () => false, escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), sendEmail: async () => assert.fail('no envía') },
    './supabase-server': { getServerSupabase: () => assert.fail('no consulta'), getStoreMembers: async () => [] },
    './stripe': { getPriceTable: async () => null, stripeConfigured: () => false },
  }
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(id) { if (Object.hasOwn(mocks, id)) return mocks[id]; throw new Error(`Unmocked import: ${id}`) },
    Date, Math, Number, String, Array, Object, Error, JSON, Promise, Intl,
  }, { filename: 'lib/trialNotices.ts' })
  return module.exports
}

const { trialNoticeFor, trialNoticeEmail, TRIAL_NOTICE_DAYS } = load()
const DAY = 86_400_000
const NOW = Date.parse('2026-11-20T15:00:00Z')
const row = (endsInDays, extra = {}) => ({
  status: 'active', plan: 'cubeta', subscription_status: null, trial_notices: 0,
  trial_ends_at: new Date(NOW + endsInDays * DAY).toISOString(),
  // Como newStoreTrial: la cortesía vence 3 días antes para que baje a Litro justo al terminar
  paid_until: new Date(NOW + (endsInDays - 3) * DAY).toISOString(),
  ...extra,
})

test('el primer aviso sale cuando faltan 3 días o menos, una sola vez', () => {
  assert.equal(TRIAL_NOTICE_DAYS, 3)
  assert.equal(trialNoticeFor(row(5), NOW), null)
  assert.equal(trialNoticeFor(row(3), NOW), 'soon')
  assert.equal(trialNoticeFor(row(0.5), NOW), 'soon')
  assert.equal(trialNoticeFor(row(2, { trial_notices: 1 }), NOW), null)
})

test('el segundo sale después de terminar, solo si ya está en Litro y no hace más de 3 días', () => {
  assert.equal(trialNoticeFor(row(-0.2), NOW), 'ended')
  assert.equal(trialNoticeFor(row(-0.2, { trial_notices: 1 }), NOW), 'ended')
  assert.equal(trialNoticeFor(row(-0.2, { trial_notices: 2 }), NOW), null)
  assert.equal(trialNoticeFor(row(-5), NOW), null, 'una prueba vieja no recibe un aviso tardío')
  // Le dieron una cortesía de Cubeta a mano: no se le dice que terminó
  assert.equal(trialNoticeFor(row(-0.2, { paid_until: new Date(NOW + 30 * DAY).toISOString() }), NOW), null)
})

test('nada para tiendas que ya pagan, suspendidas o canceladas', () => {
  for (const subscription_status of ['active', 'trialing', 'past_due']) {
    assert.equal(trialNoticeFor(row(2, { subscription_status }), NOW), null)
    assert.equal(trialNoticeFor(row(-0.2, { subscription_status }), NOW), null)
  }
  assert.equal(trialNoticeFor(row(2, { status: 'suspended' }), NOW), null)
  assert.equal(trialNoticeFor(row(-0.2, { status: 'cancelled' }), NOW), null)
  // Una tienda que ya no está en la prueba (la cambiaron a Litro a mano) no recibe «termina en…»
  assert.equal(trialNoticeFor(row(2, { plan: 'litro' }), NOW), null)
})

test('el correo dice lo que cambia, con el precio de Stripe si se pudo leer', () => {
  const facts = {
    store: 'Pinturas del Valle', adminName: 'Ana Torres', ends: NOW + 2.5 * DAY, now: NOW,
    waiting: ['Luis Herrera', 'Mariana Cruz', 'Pedro Sánchez'], whatsapp: true, link: 'https://www.matices.app/configuracion?tab=plan',
    prices: { monthly: { cubeta: { amount: 1799, currency: 'mxn', interval: 'month' } }, annual: { cubeta: { amount: 17990, currency: 'mxn', interval: 'year' } } },
  }
  const soon = trialNoticeEmail('soon', facts)
  assert.equal(soon.subject, 'Tu prueba de Cubeta termina en 3 días')
  assert.match(soon.text, /^Hola, Ana:/)
  assert.match(soon.text, /Luis, Mariana y Pedro ya no podrán entrar/)
  assert.match(soon.text, /WhatsApp de tu tienda deja de verse/)
  assert.match(soon.text, /\$1,799 al mes, o \$17,990 al año con 2 meses gratis/)
  assert.match(soon.html, /href="https:\/\/www\.matices\.app\/configuracion\?tab=plan"/)

  assert.equal(trialNoticeEmail('soon', { ...facts, ends: NOW + 0.4 * DAY }).subject, 'Tu prueba de Cubeta termina mañana')

  const ended = trialNoticeEmail('ended', { ...facts, ends: NOW - 0.2 * DAY, waiting: ['Luis Herrera'], whatsapp: false, prices: null })
  assert.equal(ended.subject, 'Terminó tu prueba de Cubeta')
  assert.match(ended.text, /Luis ya no puede entrar/)
  assert.doesNotMatch(ended.text, /WhatsApp/)
  assert.match(ended.text, /se paga cada mes o cada año/)
})

test('el HTML escapa el nombre de la tienda', () => {
  const email = trialNoticeEmail('soon', {
    store: '<b>Tienda</b>', adminName: '', ends: NOW + DAY, now: NOW, waiting: [], whatsapp: false, link: 'https://x.test', prices: null,
  })
  assert.doesNotMatch(email.html, /<b>Tienda<\/b>/)
  assert.match(email.text, /^Hola:/)
})
