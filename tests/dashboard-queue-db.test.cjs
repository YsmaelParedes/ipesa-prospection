require('./register-typescript.cjs')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const { bucketOf, inQueue, queueCompare, NO_ANSWER_LIMIT } = require('../lib/commercial.ts')

// La cola del Inicio (dashboard_queue) debe dar lo mismo que la lógica de la
// app (bucketOf/inQueue/queueCompare), ahora que se calcula en la base.
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SELLER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TODAY = '2026-11-03'
let db, rows

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role, anon, authenticated;
    create table public.contacts (
      id uuid primary key, store_id uuid not null, name text not null, company text, owner_id uuid,
      commercial_status text not null default 'nuevo', next_action text, next_action_at date,
      last_activity_at timestamptz, no_answer_streak smallint not null default 0, created_at timestamp not null
    );
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261103160000_dashboard_queue.sql'), 'utf8'))
  await db.exec('grant select on all tables in schema public to service_role;')

  // Mezcla determinista de todos los casos: fechas pasadas, hoy y futuras, sin
  // fecha con y sin actividad, depurar, rachas sin respuesta, dueños y tiendas.
  const dates = [null, '2026-10-20', '2026-11-01', TODAY, '2026-11-05', '2026-12-01']
  const owners = [ME, null, SELLER]
  const statuses = ['nuevo', 'contactado', 'cotizacion', 'depurar']
  rows = []
  for (let i = 0; i < 240; i++) {
    rows.push({
      id: uuid(i + 1),
      store_id: i % 17 === 0 ? OTHER : STORE,
      name: `Contacto ${i}`,
      company: i % 3 ? `Empresa ${i}` : null,
      owner_id: owners[i % 3],
      commercial_status: statuses[(i * 7) % 4 === 3 && i % 5 === 0 ? 3 : (i * 7) % 3],
      next_action: i % 2 ? 'Llamar' : null,
      next_action_at: dates[Math.floor(i / 3) % 6],
      last_activity_at: i % 4 === 0 ? '2026-10-15T10:00:00Z' : null,
      no_answer_streak: (i * 11) % 5,
      // Fechas de alta repetidas para probar el desempate por id
      created_at: `2026-0${1 + (i % 9)}-1${i % 7}T08:00:00`,
    })
  }
  for (const r of rows) {
    await db.query(
      `insert into public.contacts (id, store_id, name, company, owner_id, commercial_status, next_action, next_action_at, last_activity_at, no_answer_streak, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r.id, r.store_id, r.name, r.company, r.owner_id, r.commercial_status, r.next_action, r.next_action_at, r.last_activity_at, r.no_answer_streak, r.created_at])
  }
})
after(async () => { await db?.close() })

// La versión anterior (en la app): orden de la consulta (alta, id) + filtros y orden en JS
function expected(unowned) {
  const mine = rows
    .filter(r => r.store_id === STORE && (r.owner_id === ME || (unowned && r.owner_id === null)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const queue = mine.filter(c => inQueue(bucketOf(c, TODAY))).sort(queueCompare(TODAY))
  const upcoming = mine.filter(c => bucketOf(c, TODAY) === 'programado')
    .sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at))).slice(0, 6)
  return {
    count: queue.length,
    overdue: queue.filter(c => c.next_action_at && c.next_action_at < TODAY).length,
    top: queue.slice(0, 5).map(c => c.id),
    upcoming: upcoming.map(c => c.id),
  }
}

async function actual(unowned, role = 'service_role') {
  await db.exec(`set role ${role}`)
  try {
    const { rows: [r] } = await db.query('select public.dashboard_queue($1, $2, $3, $4, $5) as q', [STORE, ME, unowned, TODAY, NO_ANSWER_LIMIT])
    return r.q
  } finally { await db.exec('reset role') }
}

for (const unowned of [false, true]) {
  test(`la cola del Inicio coincide con la lógica de la app (${unowned ? 'con' : 'sin'} contactos sin responsable)`, async () => {
    const q = await actual(unowned)
    const want = expected(unowned)
    assert.ok(want.count > 5 && want.overdue > 0 && want.upcoming.length === 6, 'los datos de prueba cubren todos los casos')
    assert.equal(q.count, want.count)
    assert.equal(q.overdue, want.overdue)
    assert.deepEqual(q.top.map(c => c.id), want.top)
    assert.deepEqual(q.upcoming.map(c => c.id), want.upcoming)
    // Solo las columnas que usa el Inicio
    assert.deepEqual(Object.keys(q.top[0]).sort(), ['commercial_status', 'company', 'id', 'last_activity_at', 'name', 'next_action', 'next_action_at'])
    assert.match(q.upcoming[0].next_action_at, /^\d{4}-\d{2}-\d{2}$/)
  })
}

test('sin contactos: ceros y listas vacías', async () => {
  await db.exec('set role service_role')
  try {
    const { rows: [r] } = await db.query('select public.dashboard_queue($1, $2, true, $3) as q', [uuid(999999), ME, TODAY])
    assert.deepEqual(r.q, { count: 0, overdue: 0, top: [], upcoming: [] })
  } finally { await db.exec('reset role') }
})

test('solo el servidor (service_role) puede llamarla', async () => {
  await assert.rejects(actual(true, 'authenticated'), /permission denied/)
  await assert.rejects(actual(true, 'anon'), /permission denied/)
})
