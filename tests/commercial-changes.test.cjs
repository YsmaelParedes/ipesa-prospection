require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { dayShort, followupDetail, amountDetail, deletedDetail, stateFromHistory } = require('../lib/commercialChanges.ts')
const { zoneKey } = require('../lib/zonesServer.ts')

test('fechas cortas para el historial', () => {
  assert.equal(dayShort('2026-11-22'), '22 nov')
  assert.equal(dayShort('2026-01-05T18:00:00Z'), '5 ene')
  assert.equal(dayShort(''), '')
})

test('cambiar o poner la fecha del seguimiento', () => {
  assert.equal(followupDetail({ at: '2026-11-22', action: 'Volver a llamar' }, { at: '2026-11-29', action: 'Volver a llamar' }),
    'Cambió el seguimiento del 22 nov al 29 nov')
  assert.equal(followupDetail({ at: '2026-11-22', action: 'Volver a llamar' }, { at: '2026-11-29', action: 'Visitar' }),
    'Cambió el seguimiento del 22 nov al 29 nov · «Visitar»')
  assert.equal(followupDetail({ at: null, action: null }, { at: '2026-12-01', action: 'Dar seguimiento' }),
    'Puso seguimiento para el 1 dic · «Dar seguimiento»')
  assert.equal(followupDetail({ at: '2026-11-22', action: 'Llamar' }, { at: '2026-11-22', action: 'Visitar' }),
    'Cambió el seguimiento a «Visitar» (22 nov)')
})

test('corregir un monto y borrar una actividad', () => {
  assert.equal(amountDetail({ quote_amount: '701249.77', sale_amount: null, created_at: '2026-11-04T17:00:00Z' }, 7012.5),
    'Corrigió el monto de la cotización del 4 nov: $701,249.77 → $7,012.50')
  assert.equal(amountDetail({ quote_amount: null, sale_amount: 100, created_at: '2026-11-20T17:00:00Z' }, 120),
    'Corrigió el monto de la venta del 20 nov: $100 → $120')
  assert.equal(deletedDetail({ kind: 'whatsapp', result: 'cotizacion', quote_amount: '32500', sale_amount: null, created_at: '2026-11-20T21:25:00Z' }),
    'Borró «WhatsApp · Cotización enviada · $32,500» del 20 nov')
  assert.equal(deletedDetail({ kind: 'nota', result: null, quote_amount: null, sale_amount: null, created_at: '2026-11-20T21:25:00Z' }),
    'Borró «Nota» del 20 nov')
})

test('estado del cliente a partir de su historial (para borrar actividades viejas)', () => {
  // Sin actividades vuelve a Prospecto, sin seguimiento
  assert.deepEqual(stateFromHistory([]), {
    commercial_status: 'nuevo', next_action: null, next_action_at: null,
    last_activity_at: null, last_result: null, last_note: null, no_answer_streak: 0,
  })
  const act = (result, extra = {}) => ({ kind: 'llamada', result, note: null, next_action: 'Volver a llamar', next_action_at: '2026-11-25', created_at: '2026-11-20T10:00:00Z', ...extra })
  const s = stateFromHistory([
    act('contactado', { next_action: 'Dar seguimiento', next_action_at: '2026-11-23', note: 'Le interesa' }),
    act('no_contesta', { created_at: '2026-11-21T10:00:00Z' }),
    act('no_contesta', { created_at: '2026-11-22T10:00:00Z' }),
    { kind: 'nota', result: null, note: 'Pidió catálogo', next_action: null, next_action_at: null, created_at: '2026-11-22T12:00:00Z' },
  ])
  // «Sin contacto» no cambia el estado; la nota no cuenta como contacto pero sí es la última nota
  assert.equal(s.commercial_status, 'contactado')
  assert.equal(s.no_answer_streak, 2)
  assert.equal(s.last_result, 'no_contesta')
  assert.equal(s.last_note, 'Pidió catálogo')
  assert.equal(s.last_activity_at, '2026-11-22T10:00:00Z')
  assert.equal(s.next_action_at, '2026-11-25')
})

test('zonas iguales aunque cambien mayúsculas, acentos o espacios', () => {
  assert.equal(zoneKey('  Veracrúz   Puerto '), 'veracruz puerto')
  assert.equal(zoneKey('VERACRUZ'), zoneKey('veracruz'))
})
