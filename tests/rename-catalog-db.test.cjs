const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Renombrar una opción del catálogo cambia también a los contactos que la tienen.
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.app_config (id uuid primary key, store_id uuid not null, type text not null, label text not null);
    create table public.contacts (id uuid primary key, store_id uuid not null, segment text, acquisition_channel text, zone text);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261115210000_rename_catalog_item.sql'), 'utf8'))
})
after(async () => { await db?.close() })

async function reset() {
  await db.exec('delete from public.app_config; delete from public.contacts;')
  await db.query(`insert into public.app_config (id, store_id, type, label) values
    ($1, $2, 'segment', 'Constructor'), ($3, $2, 'segment', 'Pintor'), ($4, $2, 'zone', 'Centro'), ($5, $6, 'segment', 'Constructor')`,
  [uuid(1), STORE, uuid(2), uuid(3), uuid(4), OTHER])
  await db.query(`insert into public.contacts (id, store_id, segment, zone) values
    ($1, $2, 'Constructor', 'Centro'), ($3, $2, 'Constructor', null), ($4, $2, 'Pintor', null), ($5, $6, 'Constructor', null)`,
  [uuid(11), STORE, uuid(12), uuid(13), uuid(14), OTHER])
}
const rename = (id, label, store = STORE) => db.query('select public.rename_catalog_item($1, $2, $3) as r', [store, id, label]).then(x => x.rows[0].r)
const segments = async store => (await db.query('select segment from public.contacts where store_id = $1 order by id', [store])).rows.map(r => r.segment)

test('renombrar cambia la opción y a sus contactos, solo en esa tienda', async () => {
  await reset()
  assert.deepEqual(await rename(uuid(1), '  Constructora '), { label: 'Constructora', contacts: 2 })
  assert.deepEqual(await segments(STORE), ['Constructora', 'Constructora', 'Pintor'])
  assert.deepEqual(await segments(OTHER), ['Constructor'], 'otra tienda no cambia')
})

test('zonas: cambia la zona de los contactos', async () => {
  await reset()
  assert.deepEqual(await rename(uuid(3), 'Centro histórico'), { label: 'Centro histórico', contacts: 1 })
})

test('no se repite un nombre ni se pasa del largo', async () => {
  await reset()
  await assert.rejects(rename(uuid(1), 'pintor'), /Ya existe/)
  await assert.rejects(rename(uuid(1), '   '), /de 1 a 100/)
  await assert.rejects(rename(uuid(3), 'x'.repeat(61)), /de 1 a 60/)
  await assert.rejects(rename(uuid(1), 'Otra', OTHER), /no encontrada/)
  // Solo cambiar mayúsculas sí se puede
  assert.equal((await rename(uuid(2), 'PINTOR')).label, 'PINTOR')
})
