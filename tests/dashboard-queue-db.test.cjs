require('./register-typescript.cjs')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// La cola del Inicio (dashboard_queue) debe contar con la MISMA regla que
// Comercial › Hoy (app/api/data/commercial/route.ts):
//   pendientes = fecha de hoy o vencida, míos o sin asignar, sin «Número incorrecto»
//   nuevos     = sin fecha ni actividad, en «Prospecto», con teléfono, míos o sin asignar
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
      id uuid primary key, store_id uuid not null, name text not null, company text, owner_id uuid, phone text,
      commercial_status text not null default 'nuevo', next_action text, next_action_at date,
      last_activity_at timestamptz, no_answer_streak smallint not null default 0, created_at timestamp not null,
      search_text text
    );
    -- La bandeja (solo para que la migración cree su función; se prueba en otro archivo)
    create table public.whatsapp_thread_state (store_id uuid, phone text, last_at timestamptz, unread int, profile_name text, contact_id uuid);
    create view public.whatsapp_threads as select * from public.whatsapp_thread_state;
  `)
  // La versión original (permisos) y la de la fase 2 (la regla de Hoy)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261103160000_dashboard_queue.sql'), 'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261115120000_same_today_and_inbox_search.sql'), 'utf8'))
  await db.exec('grant select on all tables in schema public to service_role;')

  // Mezcla determinista de todos los casos: fechas pasadas, hoy y futuras, sin
  // fecha con y sin actividad, depurar, sin teléfono, dueños y tiendas.
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
      phone: i % 7 === 0 ? null : `222${String(i).padStart(7, '0')}`,
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
      `insert into public.contacts (id, store_id, name, company, owner_id, phone, commercial_status, next_action, next_action_at, last_activity_at, no_answer_streak, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r.id, r.store_id, r.name, r.company, r.owner_id, r.phone, r.commercial_status, r.next_action, r.next_action_at, r.last_activity_at, r.no_answer_streak, r.created_at])
  }
})
after(async () => { await db?.close() })

const byId = (a, b) => a.id.localeCompare(b.id)

// Comercial › Hoy, escrito en JS a partir de sus consultas
function expected(unowned) {
  const mine = rows.filter(r => r.store_id === STORE && (r.owner_id === ME || (unowned && r.owner_id === null)))
  const due = mine.filter(r => r.next_action_at && r.next_action_at <= TODAY && r.commercial_status !== 'depurar')
    .sort((a, b) => a.next_action_at.localeCompare(b.next_action_at) || byId(a, b))
  const fresh = mine.filter(r => !r.last_activity_at && !r.next_action_at && r.commercial_status === 'nuevo' && r.phone)
  // Nuevos: los míos (más recientes primero) y luego los sin asignar (menos intentos, más antiguos)
  const freshMine = fresh.filter(r => r.owner_id).sort((a, b) => b.created_at.localeCompare(a.created_at) || byId(a, b))
  const freshFree = fresh.filter(r => !r.owner_id).sort((a, b) => a.no_answer_streak - b.no_answer_streak || a.created_at.localeCompare(b.created_at) || byId(a, b))
  const upcoming = rows.filter(r => r.store_id === STORE && r.owner_id === ME && r.next_action_at > TODAY && r.commercial_status !== 'depurar')
    .sort((a, b) => a.next_action_at.localeCompare(b.next_action_at) || a.created_at.localeCompare(b.created_at) || byId(a, b)).slice(0, 6)
  return {
    count: due.length,
    overdue: due.filter(r => r.next_action_at < TODAY).length,
    fresh: fresh.length,
    top: [...due, ...freshMine, ...freshFree].slice(0, 5).map(c => c.id),
    upcoming: upcoming.map(c => c.id),
  }
}

async function actual(unowned, role = 'service_role', top = 5) {
  await db.exec(`set role ${role}`)
  try {
    const { rows: [r] } = await db.query('select public.dashboard_queue($1, $2, $3, $4, 3, $5) as q', [STORE, ME, unowned, TODAY, top])
    return r.q
  } finally { await db.exec('reset role') }
}

for (const unowned of [false, true]) {
  test(`el Inicio cuenta igual que Comercial › Hoy (${unowned ? 'con' : 'sin'} contactos sin responsable)`, async () => {
    const q = await actual(unowned)
    const want = expected(unowned)
    assert.ok(want.count > 5 && want.overdue > 0 && want.fresh > 0 && want.upcoming.length === 6, 'los datos de prueba cubren todos los casos')
    assert.equal(q.count, want.count)
    assert.equal(q.overdue, want.overdue)
    assert.equal(q.fresh, want.fresh)
    assert.deepEqual(q.top.map(c => c.id), want.top)
    assert.deepEqual(q.upcoming.map(c => c.id), want.upcoming)
    // Solo las columnas que usa el Inicio
    assert.deepEqual(Object.keys(q.top[0]).sort(), ['commercial_status', 'company', 'id', 'last_activity_at', 'name', 'next_action', 'next_action_at'])
    assert.match(q.upcoming[0].next_action_at, /^\d{4}-\d{2}-\d{2}$/)
  })
}

test('la lista corta completa con nuevos cuando hay pocos pendientes', async () => {
  const want = expected(true)
  const q = await actual(true, 'service_role', want.count + 3)
  // Primero todos los pendientes, luego 3 nuevos (sin fecha ni actividad)
  assert.equal(q.top.length, want.count + 3)
  assert.ok(q.top.slice(0, want.count).every(c => c.next_action_at !== null), 'primero los pendientes')
  assert.ok(q.top.slice(want.count).every(c => c.next_action_at === null && c.last_activity_at === null), 'los últimos son nuevos')
})

test('sin contactos: ceros y listas vacías', async () => {
  await db.exec('set role service_role')
  try {
    const { rows: [r] } = await db.query('select public.dashboard_queue($1, $2, true, $3) as q', [uuid(999999), ME, TODAY])
    assert.deepEqual(r.q, { count: 0, overdue: 0, fresh: 0, top: [], upcoming: [] })
  } finally { await db.exec('reset role') }
})

test('solo el servidor (service_role) puede llamarla', async () => {
  await assert.rejects(actual(true, 'authenticated'), /permission denied/)
  await assert.rejects(actual(true, 'anon'), /permission denied/)
})
