// Calendario de la tienda y actividades del equipo (lib/storeActivity.ts).
const h = require('./whatsapp-outbox-harness.cjs')
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { storeDays, teamActivities } = require(h.resolveTs('lib/storeActivity'))

// Lo que usaba Inicio antes: México a UTC-6 fijo
function mexicoBoundaries(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(p => [p.type, p.value]))
  const y = Number(parts.year), m = Number(parts.month) - 1, d = Number(parts.day)
  const at = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd, 6)).toISOString()
  return { startOfToday: at(y, m, d), startOfMonth: at(y, m, 1), startOfLastMonth: at(y, m - 1, 1) }
}

test('en la Ciudad de México da lo mismo que antes, también en enero y a medianoche', () => {
  for (const iso of ['2026-11-13T17:00:00Z', '2026-01-10T03:00:00Z', '2026-03-01T05:59:00Z', '2026-03-01T06:00:00Z', '2026-12-31T23:59:00Z']) {
    const now = new Date(iso)
    const d = storeDays({ store: { timezone: 'America/Mexico_City' } }, now)
    const old = mexicoBoundaries(now)
    assert.deepEqual({ startOfToday: d.startOf(d.today), startOfMonth: d.monthStart(0), startOfLastMonth: d.monthStart(-1) }, old, iso)
  }
})

test('sin zona guardada usa la de México; con otra zona, sus propios días', () => {
  const now = new Date('2026-07-15T06:30:00Z')  // 00:30 en CDMX, 23:30 del 14 en Tijuana (horario de verano)
  assert.equal(storeDays({ store: { timezone: null } }, now).today, '2026-07-15')
  const tj = storeDays({ store: { timezone: 'America/Tijuana' } }, now)
  assert.equal(tj.today, '2026-07-14')
  assert.equal(tj.startOf('2026-07-14'), '2026-07-14T07:00:00.000Z')
  assert.deepEqual(tj.days('2026-07-01', '2026-07-31'), { from: '2026-07-01T07:00:00.000Z', to: '2026-08-01T07:00:00.000Z' })
})

beforeEach(() => h.reset())

test('actividades del equipo sin cuentas de prueba; las propias tal cual', async () => {
  const TEST_USER = '99999999-9999-4999-8999-999999999999'
  h.db.tables.store_members = [{ store_id: h.STORE, user_id: TEST_USER, is_test: true }]
  const at = iso => ({ store_id: h.STORE, created_at: iso, kind: 'llamada' })
  h.db.tables.commercial_activities = [
    { id: 'a1', user_id: h.UID, ...at('2026-11-10T18:00:00Z') },
    { id: 'a2', user_id: TEST_USER, ...at('2026-11-10T19:00:00Z') },
    { id: 'a3', user_id: null, ...at('2026-11-11T18:00:00Z'), sale_amount: 500 },
    { id: 'a4', user_id: h.UID, ...at('2026-10-01T18:00:00Z') },
  ]
  const range = { from: '2026-11-01T06:00:00.000Z', to: '2026-12-01T06:00:00.000Z' }
  const ctx = { storeId: h.STORE, uid: h.UID }
  const ids = rows => rows.map(r => r.id)
  assert.deepEqual(ids(await teamActivities(ctx, { columns: 'id, user_id', range, scope: 'store' })), ['a1', 'a3'])
  assert.deepEqual(ids(await teamActivities(ctx, { columns: 'id, user_id', range, scope: 'store', newestFirst: true })), ['a3', 'a1'])
  assert.deepEqual(ids(await teamActivities(ctx, { columns: 'id, user_id', range, scope: 'mine' })), ['a1'])
  assert.deepEqual(ids(await teamActivities(ctx, { columns: 'id, user_id', range, scope: 'store', withValue: 'sale_amount' })), ['a3'])
})
