const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Recordatorios ligados a su contacto: se llenan desde los leads viejos y, si
// el contacto se borra, el recordatorio se queda (sin contacto, con su nombre en texto).
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create table public.contacts (id uuid primary key, store_id uuid not null, name text not null, unique (store_id, id));
    create table public.leads (id uuid primary key, store_id uuid not null, name text, contact_id uuid);
    create table public.reminders (id uuid primary key, store_id uuid not null, lead_id uuid, lead_name text, nota text);
  `)
  await db.query(`insert into public.contacts (id, store_id, name) values ($1, $2, 'Pinturas Juárez'), ($3, $2, 'Doña Lucía'), ($4, $5, 'De otra tienda')`,
    [uuid(1), STORE, uuid(2), uuid(3), OTHER])
  await db.query(`insert into public.leads (id, store_id, name, contact_id) values ($1, $2, 'Lead con contacto', $3), ($4, $2, 'Lead sin contacto', null), ($5, $6, 'Lead de otra tienda', $7)`,
    [uuid(11), STORE, uuid(1), uuid(12), uuid(13), OTHER, uuid(3)])
  await db.query(`insert into public.reminders (id, store_id, lead_id, lead_name, nota) values
    ($1, $2, $3, 'Pinturas Juárez', 'Llamar'), ($4, $2, $5, 'Lead sin contacto', 'Visitar'), ($6, $2, null, 'Texto libre', 'Tarea')`,
    [uuid(21), STORE, uuid(11), uuid(22), uuid(12), uuid(23)])
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261115040043_reminders_contact.sql'), 'utf8'))
})
after(async () => { await db?.close() })

const contactOf = async n => (await db.query(`select contact_id from public.reminders where id = $1`, [uuid(n)])).rows[0].contact_id

test('se ligan los que venían de un lead con contacto; los demás no', async () => {
  assert.equal(await contactOf(21), uuid(1))
  assert.equal(await contactOf(22), null)
  assert.equal(await contactOf(23), null)
})

test('no se puede ligar a un contacto de otra tienda', async () => {
  await assert.rejects(db.query(`update public.reminders set contact_id = $1 where id = $2`, [uuid(3), uuid(23)]), /foreign key/)
})

test('al borrar el contacto, el recordatorio se queda con su texto', async () => {
  await db.query(`update public.reminders set contact_id = $1 where id = $2`, [uuid(2), uuid(23)])
  await db.query(`delete from public.contacts where id = $1`, [uuid(2)])
  const { rows: [r] } = await db.query(`select contact_id, lead_name, store_id from public.reminders where id = $1`, [uuid(23)])
  assert.deepEqual(r, { contact_id: null, lead_name: 'Texto libre', store_id: STORE })
})
