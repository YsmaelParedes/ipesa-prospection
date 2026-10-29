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

/* ── Avisos a la hora ─────────────────────────────────────────────────── */

const { reminderPayload, dueReminders, LATE_LIMIT_MS } = require('../lib/reminderPush.ts')

const rem = (over = {}) => ({
  id: 'r1', store_id: 's1', user_id: 'u1', lead_name: '', nota: '', reminder_date: '2026-10-29T10:30:00', type: 'call', ...over,
})

test('aviso a la hora: con cliente, la acción va en el título y la nota en el cuerpo', () => {
  const p = reminderPayload(rem({ lead_name: 'Juan Pérez', nota: 'Confirmar cotización' }))
  assert.equal(p.title, '📞 Llamar a Juan Pérez')
  assert.equal(p.body, 'Confirmar cotización')
  assert.equal(p.tag, 'rem-r1')
  assert.equal(p.url, '/recordatorios')
  assert.equal(p.sticky, true)
})

test('aviso a la hora: sin cliente, la nota es el título', () => {
  const p = reminderPayload(rem({ nota: 'Pedir pintura al proveedor', type: 'task' }))
  assert.equal(p.title, '⏰ Pedir pintura al proveedor')
  assert.equal(p.body, 'Recordatorio de las 10:30')
})

test('aviso a la hora: con retraso se ve la hora original', () => {
  const p = reminderPayload(rem({ lead_name: 'Ana', nota: 'Visita' }), 20 * 60_000)
  assert.equal(p.body, 'Visita · pendiente desde las 10:30')
  assert.equal(reminderPayload(rem({ reminder_date: '2026-10-29T09:05:00' }), 30 * 60_000).body, 'Pendiente desde las 9:05')
  assert.equal(reminderPayload(rem({ reminder_date: '2026-10-29T13:15:00' })).body, 'Recordatorio de las 13:15')
  assert.equal(reminderPayload(rem({ reminder_date: '2026-10-29T01:15:00' })).body, 'Recordatorio de la 1:15')
})

test('solo cuentan los que ya llegaron a su hora, en la hora local de su tienda', () => {
  const rows = [
    rem({ id: 'a', reminder_date: '2026-10-29T10:29:00' }),
    rem({ id: 'b', reminder_date: '2026-10-29T10:30:00' }),
    rem({ id: 'c', reminder_date: '2026-10-29T10:31:00' }),
    rem({ id: 'd', reminder_date: '2026-10-29T03:00:00', store_id: 'lejos' }),
  ]
  const now = r => (r.store_id === 'lejos' ? '2026-10-29T02:59:00' : '2026-10-29T10:30:00')
  const due = dueReminders(rows, now)
  assert.deepEqual(due.map(d => d.r.id), ['a', 'b'])
  assert.equal(due[0].lateMs, 60_000)
  assert.equal(due[1].lateMs, 0)
  assert.ok(LATE_LIMIT_MS >= 3600_000)
})
