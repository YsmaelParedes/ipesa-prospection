require('./register-typescript.cjs')
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const { searchWords } = require('../lib/contactSearch.ts')

// La bandeja filtra y busca en la base sobre TODOS los chats (whatsapp_thread_list):
// «Sin contacto» y la búsqueda ya no se limitan a los más recientes, y la
// búsqueda no distingue acentos ni mayúsculas.
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role, anon, authenticated;
    create table public.contacts (
      id uuid primary key, store_id uuid not null, name varchar not null, company varchar, email text, phone varchar,
      segment varchar, acquisition_channel text, zone text,
      owner_id uuid, commercial_status text, next_action text, next_action_at date, last_activity_at timestamptz,
      no_answer_streak smallint default 0, created_at timestamp default now(),
      -- La misma columna que en producción
      search_text text generated always as (translate(lower(coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(email, '')
        || ' ' || coalesce(segment, '') || ' ' || coalesce(acquisition_channel, '') || ' ' || coalesce(zone, '')),
        'áéíóúüñàèìòù', 'aeiouunaeiou')) stored
    );
    create table public.whatsapp_thread_state (
      store_id uuid not null, phone text not null, last_body text, last_direction text, last_status text,
      last_media_type text, last_template text, last_at timestamptz not null, unread integer not null default 0,
      last_inbound_at timestamptz, profile_name text, contact_id uuid, primary key (store_id, phone));
    create view public.whatsapp_threads as
      select phone, last_body, last_direction, last_status, last_media_type, last_template,
             last_at, unread, last_inbound_at, profile_name, contact_id, store_id
      from public.whatsapp_thread_state;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261115120000_same_today_and_inbox_search.sql'), 'utf8'))
  await db.exec('grant select on all tables in schema public to service_role;')

  // 150 chats, uno por minuto (el 1 es el más reciente). Contactos para los pares;
  // el 140 (viejo) no es contacto, y algunos especiales abajo.
  for (let i = 1; i <= 150; i++) {
    const phone = `22200${String(i).padStart(5, '0')}`
    await db.query(`insert into public.whatsapp_thread_state (store_id, phone, last_at, unread, profile_name)
      values ($1, $2, now() - ($3 || ' minutes')::interval, $4, $5)`, [STORE, phone, i, i % 10 === 0 ? 2 : 0, i === 140 ? 'JOSÉ Núñez' : null])
    if (i % 2 === 0 && i !== 140) {
      await db.query(`insert into public.contacts (id, store_id, name, company, phone) values ($1, $2, $3, $4, $5)`,
        [uuid(i), STORE, `Cliente ${i}`, i === 120 ? 'Pinturas Pérez' : null, i === 130 ? `52${phone}` : phone])
    }
  }
  // El 7 está vinculado por id a un contacto con otro número guardado
  await db.query(`insert into public.contacts (id, store_id, name, phone) values ($1, $2, 'Doña Lucía', '5550000007')`, [uuid(7), STORE])
  await db.query(`update public.whatsapp_thread_state set contact_id = $1 where phone = '2220000007'`, [uuid(7)])
  // Otra tienda con el mismo número: no cuenta
  await db.query(`insert into public.whatsapp_thread_state (store_id, phone, last_at) values ($1, '2220000001', now())`, [OTHER])
})
after(async () => { await db?.close() })

async function list(opts = {}) {
  await db.exec('set role service_role')
  try {
    const { rows } = await db.query('select phone from public.whatsapp_thread_list($1, $2, $3, $4, $5, $6, $7)', [
      STORE, opts.unread ?? false, opts.unknown ?? false, opts.q ? searchWords(opts.q) : [], opts.digits ?? null, opts.before ?? null, opts.limit ?? 101,
    ])
    return rows.map(r => Number(r.phone.slice(-5)))
  } finally { await db.exec('reset role') }
}

test('sin filtros: los más recientes primero y con tope', async () => {
  const all = await list({ limit: 5 })
  assert.deepEqual(all, [1, 2, 3, 4, 5])
})

test('«Sin contacto» encuentra también los chats viejos (más allá de los 100 más recientes)', async () => {
  const unknown = await list({ unknown: true, limit: 200 })
  assert.ok(unknown.includes(140), 'el 140 no es contacto')
  assert.ok(!unknown.includes(7), 'vinculado por id: sí es contacto')
  assert.ok(!unknown.includes(130), 'guardado como 52…: sí es contacto')
  assert.ok(unknown.every(n => n % 2 === 1 || n === 140), 'solo los que no son contactos')
  assert.equal(unknown.filter(n => n > 100).length, 26, 'los 25 impares del 101 al 149, más el 140')
})

test('la búsqueda no distingue acentos ni mayúsculas y busca en todos los chats', async () => {
  assert.deepEqual(await list({ q: 'jose nunez' }), [140], 'por el nombre de perfil')
  assert.deepEqual(await list({ q: 'Pinturas PEREZ' }), [120], 'por la empresa del contacto')
  assert.deepEqual(await list({ q: 'dona lucia' }), [7], 'por el contacto vinculado por id')
  assert.deepEqual(await list({ q: 'perez lucia' }), [], 'todas las palabras deben aparecer')
})

test('por número y solo sin leer', async () => {
  assert.deepEqual(await list({ digits: '0000145' }), [145])
  const unread = await list({ unread: true, limit: 200 })
  assert.deepEqual(unread, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150])
})

test('paginación: antes de cierta fecha', async () => {
  await db.exec('set role service_role')
  try {
    const { rows: [fifth] } = await db.query(`select last_at from public.whatsapp_thread_state where store_id = $1 and phone = '2220000005'`, [STORE])
    assert.deepEqual(await list({ before: fifth.last_at, limit: 3 }), [6, 7, 8])
  } finally { await db.exec('reset role') }
})

test('solo el servidor (service_role) puede llamarla', async () => {
  for (const role of ['authenticated', 'anon']) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(db.query('select * from public.whatsapp_thread_list($1)', [STORE]), /permission denied/)
    } finally { await db.exec('reset role') }
  }
})
