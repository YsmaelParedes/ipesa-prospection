const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Entrega 3: el plan del IFT marca «Fijo» a los contactos sin verificar cuyo
// número es fijo (la evidencia de WhatsApp gana) y la bandeja oculta los chats
// de números sin WhatsApp (131026 sin respuesta ni entrega).
const STORE = '11111111-1111-4111-8111-111111111111'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATIONS = path.join(__dirname, '../supabase/migrations')
const migration = suffix => fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find(f => f.endsWith(suffix))), 'utf8')
let db

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const all = async (sql, params = []) => (await db.query(sql, params)).rows

// Rangos de prueba: 2221000000-2221999999 fijo, 2222000000-2222999999 celular,
// y 1,000 rangos de relleno (el plan nunca llega tan pequeño).
const PLAN = [[2221000000, 2221999999, 'f'], [2222000000, 2222999999, 'm']]
for (let i = 0; i < 1000; i++) PLAN.push([9000000000 + i * 10000, 9000000000 + i * 10000 + 9999, i % 2 ? 'f' : 'm'])

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stores (id uuid primary key);
    insert into public.stores values ('${STORE}');
    create table public.contacts (
      id uuid primary key, store_id uuid not null references stores(id), name text not null, company text, email text,
      phone text, segment text, acquisition_channel text, zone text,
      line_type text check (line_type in ('whatsapp', 'fijo')), updated_at timestamptz,
      search_text text generated always as (lower(coalesce(name, '') || ' ' || coalesce(company, ''))) stored,
      unique (store_id, id));
    create table public.whatsapp_messages (
      id uuid primary key default gen_random_uuid(), contact_id uuid, phone text not null,
      direction text not null check (direction in ('inbound','outbound')), body text, status text not null default 'sent',
      error_code integer, template_name text, created_at timestamptz not null default clock_timestamp(),
      read_at timestamptz, media_type text, profile_name text,
      store_id uuid not null references stores(id));
  `)
  await db.exec(migration('_whatsapp_thread_state.sql'))
  await db.exec('create table public.store_whatsapp (store_id uuid primary key)')
  await db.exec(migration('_whatsapp_previous_number.sql'))
  await db.exec(migration('_whatsapp_fijos_ift.sql'))
})
after(async () => { await db?.close() })

let n = 0
const newContact = async (phone, lineType = null) => {
  const id = uuid(++n)
  await db.query(`insert into public.contacts (id, store_id, name, phone, line_type) values ($1, $2, $3, $4, $5)`, [id, STORE, `Cliente ${n}`, phone, lineType])
  return id
}
const lineOf = async id => (await one(`select line_type from public.contacts where id = $1`, [id])).line_type
const message = (phone, fields = {}) => db.query(
  `insert into public.whatsapp_messages (store_id, phone, direction, status, error_code) values ($1, $2, $3, $4, $5)`,
  [STORE, phone, fields.direction ?? 'outbound', fields.status ?? 'sent', fields.error ?? null])
const listed = async (opts = {}) => (await all(
  `select phone from public.whatsapp_thread_list($1, false, false, $2, $3, null, 1000)`,
  [STORE, opts.words ?? [], opts.digits ?? null])).map(r => r.phone)

test('el plan se carga completo y marca «Fijo» a los contactos sin verificar', async () => {
  // Antes de cargar el plan: nadie se clasifica
  const before = await newContact('2221234567')
  assert.equal(await lineOf(before), null)
  const confirmed = await newContact('2221111111', 'whatsapp')
  const mobile = await newContact('2222234567')
  // Ya habló por WhatsApp: no se marca fijo aunque el plan lo diga
  await message('2221555555', { direction: 'inbound', status: 'received' })
  const talked = await newContact('2221555555')
  assert.equal(await lineOf(talked), 'whatsapp')

  await assert.rejects(db.query(`select public.replace_ift_numbering('[[2221000000, 2221999999, "f"]]'::jsonb)`), /incompleto/)
  const r = await one(`select public.replace_ift_numbering($1::jsonb) as r`, [JSON.stringify(PLAN)])
  assert.equal(r.r.rangos, PLAN.length)
  assert.equal(r.r.contactos_fijos, 1)
  assert.equal(await lineOf(before), 'fijo')
  assert.equal(await lineOf(confirmed), 'whatsapp')
  assert.equal(await lineOf(mobile), null)
  assert.equal((await one(`select updated_at from public.contacts where id = $1`, [before])).updated_at, null)

  // Recargar el plan reemplaza los rangos (no los duplica)
  const again = await one(`select public.replace_ift_numbering($1::jsonb) as r`, [JSON.stringify(PLAN)])
  assert.equal(again.r.rangos, PLAN.length)
  assert.equal((await one(`select count(*)::int as c from public.ift_numbering`)).c, PLAN.length)
})

test('ift_kind: fijo, celular, con 52 o 521, fuera del plan o inválido', async () => {
  const kind = async p => (await one(`select public.ift_kind($1) as k`, [p])).k
  assert.equal(await kind('2221000000'), 'fijo')
  assert.equal(await kind('2221999999'), 'fijo')
  assert.equal(await kind('2222500000'), 'movil')
  assert.equal(await kind('522221234567'), 'fijo')
  assert.equal(await kind('5212222234567'), 'movil')
  assert.equal(await kind('222 123 4567'), 'fijo')
  assert.equal(await kind('2223000000'), null)
  assert.equal(await kind('12345'), null)
  assert.equal(await kind(null), null)
})

test('al guardar un contacto se clasifica; lo que eligió el vendedor se respeta', async () => {
  const fixed = await newContact('2221000001')
  assert.equal(await lineOf(fixed), 'fijo')
  assert.equal(await lineOf(await newContact('2222000001')), null)
  assert.equal(await lineOf(await newContact('2221000002', 'whatsapp')), 'whatsapp')
  assert.equal(await lineOf(await newContact(null)), null)
  // Cambia a un celular: la app limpia el tipo de línea y se vuelve a clasificar
  await db.query(`update public.contacts set phone = '2222000009', line_type = null where id = $1`, [fixed])
  assert.equal(await lineOf(fixed), null)
  await db.query(`update public.contacts set phone = '2221000009', line_type = null where id = $1`, [fixed])
  assert.equal(await lineOf(fixed), 'fijo')
  // Cambiar otra cosa no lo toca
  await db.query(`update public.contacts set line_type = null, name = 'Otro' where id = $1`, [fixed])
  assert.equal(await lineOf(fixed), null)
})

test('la bandeja oculta los números sin WhatsApp y los muestra al buscarlos', async () => {
  await message('2220000001', { status: 'failed', error: 131026 })                  // sin WhatsApp
  await message('2220000002', { status: 'failed', error: 131026 })
  await message('2220000002', { direction: 'inbound', status: 'received' })          // pero luego escribió
  await message('2220000003', { status: 'failed', error: 130472 })                  // otra falla: se queda
  await message('2220000004', { status: 'failed', error: 131026 })
  await message('2220000004', { status: 'delivered' })                               // le llegó otro: se queda

  const shown = await listed()
  assert.ok(!shown.includes('2220000001'))
  for (const p of ['2220000002', '2220000003', '2220000004']) assert.ok(shown.includes(p), p)
  assert.deepEqual(await listed({ digits: '0000001' }), ['2220000001'])
  assert.ok((await listed({ words: ['2220000001'] })).includes('2220000001'))

  // Si escribe algún día, su chat vuelve
  await message('2220000001', { direction: 'inbound', status: 'received' })
  assert.ok((await listed()).includes('2220000001'))
  assert.equal((await one(`select no_whatsapp from public.whatsapp_threads where phone = '2220000001'`)).no_whatsapp, false)
})
