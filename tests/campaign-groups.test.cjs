require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bundleCampaigns, bundleLabel, mergeDetails, localDay } = require('../lib/campaignGroups.ts')

// Mediodía local: el mismo día en cualquier zona horaria razonable
const at = (day, hour) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString()
const summary = (id, template, day, hour, label, n = {}) => ({
  id, template, label, startedAt: at(day, hour), endedAt: at(day, hour),
  total: n.total ?? 10, read: 0, delivered: 0, pending: n.pending ?? 0, failed: n.failed ?? 1, replied: n.replied ?? 2, seen: n.seen ?? 5, failures: [],
})

test('los envíos de la misma plantilla en el mismo día son una campaña, la más reciente primero', () => {
  const list = [
    summary('a', 'buen_fin', '2026-11-10', 20, 'Herrero'),
    summary('b', 'buen_fin', '2026-11-10', 21, 'Escuelas', { total: 20, failed: 2, replied: 3, seen: 8 }),
    summary('c', 'buen_fin', '2026-11-09', 12, 'Brigadier herrero'),
    summary('d', 'precios', '2026-11-12', 10, 'Pintores'),
    summary('e', 'buen_fin', '2026-11-10', 22, 'Herrero'),
  ]
  const bundles = bundleCampaigns(list)
  assert.deepEqual(bundles.map(b => b.key), ['precios|2026-11-12', 'buen_fin|2026-11-10', 'buen_fin|2026-11-09'])
  const fin = bundles[1]
  assert.deepEqual(fin.ids, ['a', 'b', 'e'])
  assert.deepEqual(fin.labels, ['Herrero', 'Escuelas'])
  assert.deepEqual([fin.total, fin.failed, fin.replied, fin.seen], [40, 4, 7, 18])
  assert.equal(fin.startedAt, at('2026-11-10', 20))
  assert.equal(localDay(fin.startedAt), '2026-11-10')
  assert.equal(bundleLabel(['A', 'B', 'C', 'D', 'E']), 'A, B y 3 más')
  assert.equal(bundleLabel([]), null)
})

test('al abrirla, los resultados se juntan y cada quien queda en el grupo de su envío', () => {
  const rec = (phone, bucket, replied = false) => ({ phone, contactId: phone, name: phone, segment: 'Otro', bucket, sentAt: '', updatedAt: '', kind: null, error: null, replied, reply: null, previousFailures: 0, lastFailedAt: null, receivedLater: false, attempts: 1 })
  const detail = (id, label, hour, recipients) => ({ ...summary(id, 'buen_fin', '2026-11-10', hour, label), recipients })
  const merged = mergeDetails([
    detail('b', 'Escuelas', 21, [rec('3', 'read', true), rec('4', 'failed'), rec('1', 'read')]),
    detail('a', 'Herrero', 20, [rec('1', 'delivered'), rec('2', 'delivered', true)]),
  ])
  assert.equal(merged.label, 'Herrero y Escuelas')
  assert.equal(merged.total, 4)
  // El número 1 recibió en los dos envíos: cuenta el último (Escuelas, leído)
  assert.deepEqual(merged.recipients.find(r => r.phone === '1').sendLabel, 'Escuelas')
  assert.deepEqual([merged.read, merged.delivered, merged.failed, merged.replied, merged.seen], [2, 1, 1, 2, 3])
  // Un solo envío queda tal cual
  const one = detail('x', 'Pintores', 9, [rec('9', 'read')])
  assert.equal(mergeDetails([one]), one)
})
