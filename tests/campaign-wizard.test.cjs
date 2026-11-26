require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  groupContacts, shortNames, fullNames, templateTitle, firstNameOf, variablesOf, bodyParts, blanksOf,
  looksLikeName, paramsFor, isMarketing, NO_SEGMENT,
} = require('../lib/campaignWizard.ts')
const { firstReplies, summarizeBatch } = require('../lib/campaignHistory.ts')
const { parsePending } = require('../lib/campaignPending.ts')

const person = (id, segment, block = null, hold = false) => ({ id, name: `P ${id}`, phone: '2225550100', segment, history: 'never', block, hold })

test('grupos: por segmento, en el orden del catálogo, sin segmento al final y solo con quien puede recibirla', () => {
  const groups = groupContacts([
    person('1', 'Hogar'), person('2', 'Pintores'), person('3', null), person('4', 'Pintores', 'landline'),
    person('5', 'Hoteles', 'opt_out'), person('6', 'Zapaterías'), person('7', 'Pintores', 'no_whatsapp'), person('8', '  '),
  ], ['Pintores', 'Hogar', 'Hoteles'])
  assert.deepEqual(groups.map(g => g.name), ['Pintores', 'Hogar', 'Zapaterías', NO_SEGMENT])
  assert.deepEqual(groups[0].ids, ['2'])
  assert.deepEqual(groups[0].blocked, { landline: 1, no_whatsapp: 1 })
  assert.deepEqual(groups[3].ids, ['3', '8'])
})

test('nombres de un envío', () => {
  assert.equal(shortNames(['Pintores']), 'Pintores')
  assert.equal(shortNames(['Pintores', 'Hogar']), 'Pintores y Hogar')
  assert.equal(shortNames(['Pintores', 'Hogar', 'Hoteles']), 'Pintores, Hogar y Hoteles')
  assert.equal(shortNames(['A', 'B', 'C', 'D', 'E']), 'A, B y 3 más')
  assert.equal(fullNames(['A', 'B', 'C', 'D']), 'A, B, C y D')
  assert.equal(templateTitle('buen_fin_2026'), 'Buen fin 2026')
  assert.equal(firstNameOf('  María  López '), 'María')
  assert.equal(firstNameOf(''), 'cliente')
})

test('el cuerpo de una plantilla: nombre, datos que se escriben y valores para el envío', () => {
  const body = 'Hola {{1}}, del {{2}} tienes {{3}} de descuento. Vence el {{2}}.'
  assert.deepEqual(variablesOf(body), [0, 1, 2])
  assert.deepEqual(bodyParts('Hola {{1}}, ve {{2}}', true), [{ text: 'Hola ' }, { name: true }, { text: ', ve ' }, { v: 1 }])
  assert.deepEqual(bodyParts('Hola {{1}}', false), [{ text: 'Hola ' }, { v: 0 }])
  assert.deepEqual(blanksOf(body, true), [1, 2])
  assert.deepEqual(blanksOf(body, false), [0, 1, 2])
  assert.deepEqual(paramsFor(body, true, { 1: ' 20 al 23 ', 2: '20 %' }), ['', '20 al 23', '20 %'])
  assert.deepEqual(paramsFor('Sin datos', false, {}), [])
})

test('¿{{1}} es el nombre del cliente?', () => {
  assert.equal(looksLikeName('Hola {{1}}, ya llegó'), true)
  assert.equal(looksLikeName('¡Buenas tardes {{1}}!'), true)
  assert.equal(looksLikeName('{{1}}, tu pedido está listo'), true)
  assert.equal(looksLikeName('Estimada {{1}}:'), true)
  assert.equal(looksLikeName('Del {{1}} al {{2}} hay descuento'), false)
  assert.equal(looksLikeName('Hola, tu folio es {{1}}'), false)
})

test('la pausa de 24 h es solo para marketing', () => {
  assert.equal(isMarketing('MARKETING'), true)
  assert.equal(isMarketing(undefined), true)
  assert.equal(isMarketing('UTILITY'), false)
})

test('resultados: leídas cuenta a quien respondió aunque no haya palomita azul, y la primera respuesta', () => {
  const t0 = Date.parse('2026-11-20T10:00:00Z')
  const row = (phone, status, ms = 0) => ({ id: phone, phone, contact_id: null, template_name: 'x', status, error_message: null, created_at: new Date(t0 + ms).toISOString(), updated_at: new Date(t0 + ms).toISOString() })
  const batch = { id: 'x', template: 'x', label: null, startMs: t0, endMs: t0, rows: [row('1', 'read'), row('2', 'delivered'), row('3', 'delivered'), row('4', 'failed')], attempts: new Map() }
  const replied = new Set(['2'])
  const sum = summarizeBatch(batch, replied)
  assert.equal(sum.seen, 2)
  assert.equal(sum.read, 1)
  const at = h => new Date(t0 + h * 3_600_000).toISOString()
  const replies = firstReplies(batch, [
    { phone: '2', created_at: at(-1), body: 'antes' },
    { phone: '2', created_at: at(1), body: ' Quiero cotizar ' },
    { phone: '2', created_at: at(2), body: 'otra' },
    { phone: '3', created_at: at(80), body: 'tarde' },
    { phone: '4', created_at: at(1), body: 'falló' },
  ])
  assert.deepEqual([...replies], [['2', 'Quiero cotizar']])
})

test('pendiente: valida lo que llega del navegador', () => {
  const ok = {
    campaignId: '11111111-1111-4111-8111-111111111111', template: 'buen_fin', language: 'es_MX', category: 'MARKETING',
    label: ' Pintores ', bodyPreview: 'Hola {{1}}', personalize: true, bodyParams: ['', '20 %'],
    contactIds: ['22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222'],
  }
  const p = parsePending(ok)
  assert.equal(typeof p, 'object')
  assert.equal(p.label, 'Pintores')
  assert.deepEqual(p.contactIds, ['22222222-2222-4222-8222-222222222222'])
  assert.equal(p.headerImageUrl, null)
  assert.equal(typeof parsePending({ ...ok, template: 'Buen Fin' }), 'string')
  assert.equal(typeof parsePending({ ...ok, contactIds: [] }), 'string')
  assert.equal(typeof parsePending({ ...ok, headerImageUrl: 'http://x.com/a.png' }), 'string')
  assert.equal(parsePending({ ...ok, headerImageUrl: 'https://x.com/a.png' }).headerImageUrl, 'https://x.com/a.png')
})
