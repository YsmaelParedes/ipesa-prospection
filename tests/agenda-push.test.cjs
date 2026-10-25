require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { agendaPayload } = require('../lib/reminderPush.ts')

test('resumen de la mañana: primero por hora y los seguimientos comerciales al final', () => {
  const p = agendaPayload({
    today: [
      { sort: '99:99', line: 'Volver a llamar: Ferretería X' },
      { sort: '10:30', line: '10:30 Llamar a Ana' },
      { sort: '09:00', line: '9:00 Visita' },
      { sort: '99:99', line: 'Cotizar: Y' },
    ],
    overdue: 2, recent: 1,
  })
  assert.equal(p.title, '📋 Hoy tienes 4 pendientes')
  assert.equal(p.body, '9:00 Visita\n10:30 Llamar a Ana\nVolver a llamar: Ferretería X\ny 1 más · 2 vencidos')
  assert.equal(p.url, '/recordatorios')
})

test('sin nada para hoy, avisa los vencidos', () => {
  const p = agendaPayload({ today: [], overdue: 1, recent: 1 })
  assert.equal(p.title, '⚠️ Tienes 1 pendiente vencido')
})
