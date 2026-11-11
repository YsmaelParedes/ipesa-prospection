require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const k = require('../lib/campaignKinds.ts')

test('nombre del envío a partir de los segmentos', () => {
  assert.equal(k.campaignLabelFor(['Ferreterías', 'Ferreterías']), 'Ferreterías')
  assert.equal(k.campaignLabelFor(['Pintores', 'Ferreterías', 'Ferreterías']), 'Ferreterías y Pintores')
  assert.equal(k.campaignLabelFor(['A', 'B', 'B', 'C', 'D']), 'B, A y 2 más')
  assert.equal(k.campaignLabelFor([null, '  ']), 'Sin segmento')
  assert.equal(k.campaignLabelFor([]), 'Sin segmento')
})

test('el id de campaña lleva el envío cuando existe', () => {
  const send = '0b8f8c2e-4a3b-4c2d-9e1f-123456789abc'
  assert.equal(k.campaignIdOf('promo_x', 1762828129000), 'promo_x.1762828129000')
  assert.equal(k.campaignIdOf('promo_x', 1762828129000, send), `promo_x.1762828129000.${send}`)
  assert.deepEqual(k.parseCampaignId(`promo_x.1762828129000.${send}`), { template: 'promo_x', startMs: 1762828129000, sendId: send })
  assert.deepEqual(k.parseCampaignId('promo_x.1762828129000'), { template: 'promo_x', startMs: 1762828129000, sendId: null })
  assert.equal(k.parseCampaignId('promo_x.1762828129000.no-es-uuid'), null)
})

test('dos segmentos con la misma plantilla son dos envíos; lo viejo se agrupa por tiempo', () => {
  const h = require('../lib/campaignHistory.ts')
  const A = '0b8f8c2e-4a3b-4c2d-9e1f-123456789abc', B = '1b8f8c2e-4a3b-4c2d-9e1f-123456789abc'
  const row = (id, min, campaign_id = null, campaign_label = null) => ({
    id, phone: `22200000${id}`, contact_id: null, template_name: 'promo', status: 'sent', error_message: null,
    created_at: new Date(Date.UTC(2026, 10, 10, 20, min)).toISOString(), updated_at: '', campaign_id, campaign_label,
  })
  const batches = h.groupIntoBatches([row('01', 0, A, 'Ferreterías'), row('02', 1, A, 'Ferreterías'), row('03', 2, B, 'Pintores'), row('04', 3), row('05', 4)])
  assert.deepEqual(batches.map(b => [b.label, b.rows.length]).sort(), [[null, 2], ['Ferreterías', 2], ['Pintores', 1]].sort())
  assert.ok(batches.find(b => b.label === 'Pintores').id.endsWith(B))
})
