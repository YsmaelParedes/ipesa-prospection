require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { dayInZone } = require('../lib/datetime.ts')
const { previousSameDays } = require('../lib/commercial.ts')

test('dayInZone: una alta de la noche en México es de ese día, no del siguiente', () => {
  // contacts.created_at: timestamp sin zona que guarda hora UTC
  assert.equal(dayInZone('2026-11-15T03:30:00', 'America/Mexico_City'), '2026-11-14')
  assert.equal(dayInZone('2026-11-15T03:30:00.123456', 'America/Mexico_City'), '2026-11-14')
  assert.equal(dayInZone('2026-11-15 03:30:00', 'America/Mexico_City'), '2026-11-14')
  assert.equal(dayInZone('2026-11-15T18:00:00', 'America/Mexico_City'), '2026-11-15')
  // Con zona explícita se respeta
  assert.equal(dayInZone('2026-11-15T03:30:00Z', 'America/Mexico_City'), '2026-11-14')
  assert.equal(dayInZone('2026-11-15T03:30:00+00:00', 'America/Mexico_City'), '2026-11-14')
  assert.equal(dayInZone('2026-11-14T22:00:00-06:00', 'America/Mexico_City'), '2026-11-14')
  // Otra zona, vacíos y una fecha sola
  assert.equal(dayInZone('2026-11-15T03:30:00', 'UTC'), '2026-11-15')
  assert.equal(dayInZone(null), '')
  assert.equal(dayInZone(''), '')
  assert.equal(dayInZone('2026-11-15'), '2026-11-15')
})

test('previousSameDays: el mes en curso contra los mismos días del mes pasado', () => {
  assert.deepEqual(previousSameDays('month', '2026-11-01', '2026-11-14'), { from: '2026-10-01', to: '2026-10-14' })
  assert.deepEqual(previousSameDays('month', '2026-11-01', '2026-11-01'), { from: '2026-10-01', to: '2026-10-01' })
  // Marzo 30 contra febrero: se topa en su último día
  assert.deepEqual(previousSameDays('month', '2026-03-01', '2026-03-30'), { from: '2026-02-01', to: '2026-02-28' })
  // Un mes completo contra el anterior completo
  assert.deepEqual(previousSameDays('month', '2026-10-01', '2026-10-31'), { from: '2026-09-01', to: '2026-09-30' })
  // Semana (lunes a miércoles) contra lunes a miércoles anteriores
  assert.deepEqual(previousSameDays('week', '2026-11-09', '2026-11-11'), { from: '2026-11-02', to: '2026-11-04' })
  assert.deepEqual(previousSameDays('day', '2026-11-14', '2026-11-14'), { from: '2026-11-13', to: '2026-11-13' })
})
