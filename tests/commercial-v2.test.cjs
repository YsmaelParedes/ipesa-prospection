require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const c = require('../lib/commercial.ts')

test('un solo avance: Prospecto → Contactado → Cotización → Cliente', () => {
  assert.equal(c.statusInfo('nuevo').label, 'Prospecto')
  assert.equal(c.statusInfo('interes').label, 'Contactado')
  assert.equal(c.statusInfo('depurar').label, 'Número incorrecto')
  assert.deepEqual([...c.STATUS_CHOICES], ['nuevo', 'contactado', 'cotizacion', 'cliente', 'no_interesado', 'depurar'])
  assert.equal(c.STAGE_PROBABILITY.contactado, 0.5)
  assert.equal(c.STAGE_PROBABILITY.cotizacion, 0.75)
})

test('los 6 resultados con su fecha sugerida y su avance', () => {
  assert.deepEqual([...c.RESULT_CHOICES], ['no_contesta', 'contactado', 'cotizacion', 'venta', 'no_interesado', 'numero_equivocado'])
  const today = '2026-10-23'
  assert.deepEqual(c.suggestNext('no_contesta', today), { status: null, nextAction: 'Volver a llamar', nextAt: '2026-10-24' })
  assert.equal(c.suggestNext('cotizacion', today).nextAt, '2026-10-25')
  assert.equal(c.suggestNext('cotizacion', today).status, 'cotizacion')
  assert.equal(c.suggestNext('venta', today).status, 'cliente')
  assert.equal(c.suggestNext('no_interesado', today).nextAt, '2027-01-21')
  assert.equal(c.suggestNext('numero_equivocado', today).nextAt, null)
  assert.equal(c.RESULT_RULES.no_contesta.label, 'Sin contacto')
  assert.equal(c.RESULT_RULES.numero_equivocado.label, 'Número incorrecto')
  assert.match(c.outcomeText('cotizacion'), /75 %/)
  assert.match(c.outcomeText('no_interesado'), /90 días/)
})

test('contacto efectivo y conteos del día', () => {
  assert.equal(c.isEffective('no_contesta'), false)
  assert.equal(c.isEffective('numero_equivocado'), false)
  assert.equal(c.isEffective('contactado'), true)
  const counts = c.countActivities([
    { kind: 'llamada', result: 'no_contesta', is_followup: false, quote_amount: null, sale_amount: null },
    { kind: 'llamada', result: 'cotizacion', is_followup: true, quote_amount: '17005', sale_amount: null },
    { kind: 'whatsapp', result: 'venta', is_followup: true, quote_amount: null, sale_amount: 9850 },
  ])
  assert.deepEqual(counts, { calls: 2, effective: 2, quotes: 1, followups: 2, sales: 1, quoted: 17005, sold: 9850 })
})

test('metas: las del Excel por omisión y propias por vendedor', () => {
  assert.deepEqual(c.DEFAULT_GOALS, { calls: 30, effective: 15, quotes: 6, followups: 10, sales: 2 })
  const uid = '671bd236-012b-47b1-bf43-c128903afb44'
  const cfg = c.parseGoalsConfig({ calls: 25, effective: 12, quotes: 5, followups: 10, sales: 2, byUser: { [uid]: { calls: 40, effective: 20, quotes: 8, followups: 12, sales: 3 }, 'no-es-uuid': { calls: 1 } } })
  assert.equal(c.goalsFor(cfg, uid).calls, 40)
  assert.equal(c.goalsFor(cfg, '83b586d3-ebdf-4274-91df-289987967717').calls, 25)
  assert.deepEqual(Object.keys(cfg.byUser), [uid])
  assert.deepEqual(c.parseGoalsConfig(null).team, c.DEFAULT_GOALS)
})

test('cumplimiento: cada indicador topado en 100 % y por días hábiles del mes', () => {
  const goals = { calls: 30, effective: 15, quotes: 6, followups: 10, sales: 2 }
  assert.equal(c.compliance({ calls: 60, effective: 15, quotes: 6, followups: 10, sales: 2 }, goals), 1)
  assert.equal(c.compliance({ calls: 15, effective: 0, quotes: 0, followups: 0, sales: 0 }, goals), 0.1)
  assert.equal(c.compliance({ calls: 30, effective: 15, quotes: 6, followups: 10, sales: 2 }, goals, 2), 0.5)
  // Octubre 2026: el 1 es jueves; del 1 al 23 hay 3 domingos (4, 11, 18)
  assert.equal(c.workDaysUntil('2026-10-23'), 20)
})

test('Hoy: vencidos, de hoy y prospectos nuevos sin importar la dirección', () => {
  const base = { commercial_status: 'nuevo', last_activity_at: null, address: 'SIN NUMERO' }
  assert.equal(c.bucketOf({ ...base, next_action_at: null }, '2026-10-23'), 'nuevo')
  assert.equal(c.bucketOf({ ...base, next_action_at: '2026-10-20' }, '2026-10-23'), 'vencido')
  assert.equal(c.bucketOf({ ...base, next_action_at: '2026-10-23' }, '2026-10-23'), 'hoy')
  assert.equal(c.bucketOf({ ...base, commercial_status: 'depurar', next_action_at: null }, '2026-10-23'), 'depurar')
})
