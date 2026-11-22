const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Productos (1.66.0): listas de precios por tienda, importar sin borrar lo que
// llega vacío, el límite de Litro, borrar una lista y buscar.
const CUBETA = '11111111-1111-4111-8111-111111111111'
const LITRO = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const MIGRATIONS = path.join(__dirname, '../supabase/migrations')
const PRODUCTS_SQL = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_productos.sql'))
let db

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const all = async (sql, params = []) => (await db.query(sql, params)).rows
const num = v => (v === null || v === undefined ? v : Number(v))

/** store_effective_plan tal como está en producción (de la migración de dos planes). */
function effectivePlanSql() {
  const src = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_dos_planes.sql'))), 'utf8')
  const start = src.indexOf('create or replace function public.store_effective_plan(')
  const end = src.indexOf('$$;', src.indexOf('$$', start) + 2) + 3
  assert.ok(start >= 0 && end > start, 'no se encontró store_effective_plan')
  return src.slice(start, end)
}

const mainList = async store => (await one(`select id from public.price_lists where store_id = $1 and is_main`, [store])).id
const importItems = async (store, items) => (await one(`select public.import_products($1, $2::jsonb) as r`, [store, JSON.stringify(items)])).r
const listsFor = async (store, names) => (await one(`select public.ensure_price_lists($1, $2::text[]) as ids`, [store, names])).ids
const product = async (store, where, params = []) => one(`select * from public.products where store_id = $1 and ${where}`, [store, ...params])

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stores (id uuid primary key, name text, plan text not null default 'litro', paid_until timestamptz);
    insert into public.stores values ('${CUBETA}', 'Pinturas', 'cubeta', null), ('${LITRO}', 'Chica', 'litro', null);
    create table public.contacts (id uuid primary key default gen_random_uuid(), store_id uuid not null);
    create table public.leads (id uuid primary key default gen_random_uuid(), store_id uuid not null);
    create table public.quotes (id uuid primary key default gen_random_uuid(), store_id uuid not null, folio int);
  `)
  await db.exec(effectivePlanSql())
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, PRODUCTS_SQL), 'utf8'))
})
after(async () => { await db?.close() })

test('cada tienda tiene la lista Público como principal, también las nuevas', async () => {
  for (const store of [CUBETA, LITRO]) {
    const lists = await all(`select name, is_main from public.price_lists where store_id = $1`, [store])
    assert.deepEqual(lists, [{ name: 'Público', is_main: true }])
  }
  await db.query(`insert into public.stores (id, name) values ($1, 'Nueva')`, [OTHER])
  assert.deepEqual(await all(`select name, is_main from public.price_lists where store_id = $1`, [OTHER]), [{ name: 'Público', is_main: true }])
})

test('listas de un archivo: crea las que faltan y reconoce las que ya existen', async () => {
  const [pub, tarjeta, aplazo] = await listsFor(CUBETA, ['público', 'Tarjeta', 'Aplazo'])
  assert.equal(pub, await mainList(CUBETA))
  assert.notEqual(tarjeta, aplazo)
  const again = await listsFor(CUBETA, [' APLAZO ', 'tarjeta'])
  assert.deepEqual(again, [aplazo, tarjeta])
  const names = (await all(`select name from public.price_lists where store_id = $1 order by created_at, name`, [CUBETA])).map(r => r.name)
  assert.deepEqual(names.sort(), ['Aplazo', 'Público', 'Tarjeta'])
  await assert.rejects(listsFor(CUBETA, ['   ']), /necesita un nombre/)
})

test('importar: crea productos con sus precios y descarta lo que no es de la tienda', async () => {
  const pub = await mainList(CUBETA)
  const [tarjeta] = await listsFor(CUBETA, ['Tarjeta'])
  const otherList = await mainList(OTHER)
  const r = await importItems(CUBETA, [
    { key: 'wall-cover-blanco', sku: '1209054', name: 'WALL COVER PLUS - BLANCO', category: 'IMPERMEABILIZANTES', brand: 'IPESA',
      unit: 'Cubeta', cost: 1990.56, tax_rate: 16, stock: 0, prices: { [pub]: 3053, [tarjeta]: 3215, [otherList]: 1, nope: 5 } },
    { key: 'aplicacion-muros', name: 'APLICACION EN MUROS', kind: 'service', unit: 'Metro', prices: { [pub]: 60, [tarjeta]: 'caro' } },
    { key: 'sin-nombre', name: '   ', prices: { [pub]: 10 } },
  ])
  assert.deepEqual(r, { created: 2, updated: 0, overLimit: 0, invalid: 1, limit: null })
  const wall = await product(CUBETA, `ext_key = 'wall-cover-blanco'`)
  assert.equal(wall.sku, '1209054')
  assert.equal(num(wall.cost), 1990.56)
  assert.equal(num(wall.tax_rate), 16)
  assert.equal(num(wall.stock), 0)
  assert.deepEqual(Object.fromEntries(Object.entries(wall.prices).map(([k, v]) => [k, Number(v)])), { [pub]: 3053, [tarjeta]: 3215 })
  const svc = await product(CUBETA, `ext_key = 'aplicacion-muros'`)
  assert.equal(svc.kind, 'service')
  assert.deepEqual(Object.keys(svc.prices), [pub])
})

test('volver a importar: actualiza por clave, lo vacío no borra y los precios se combinan', async () => {
  const pub = await mainList(CUBETA)
  const [tarjeta, aplazo] = await listsFor(CUBETA, ['Tarjeta', 'Aplazo'])
  const r = await importItems(CUBETA, [
    { key: 'wall-cover-blanco', name: '', brand: '', cost: null, stock: 12, prices: { [aplazo]: 3557, [pub]: 3100 } },
  ])
  assert.deepEqual(r, { created: 0, updated: 1, overLimit: 0, invalid: 0, limit: null })
  const wall = await product(CUBETA, `ext_key = 'wall-cover-blanco'`)
  assert.equal(wall.name, 'WALL COVER PLUS - BLANCO')
  assert.equal(wall.brand, 'IPESA')
  assert.equal(num(wall.cost), 1990.56)
  assert.equal(num(wall.stock), 12)
  assert.deepEqual(Object.fromEntries(Object.entries(wall.prices).map(([k, v]) => [k, Number(v)])), { [pub]: 3100, [tarjeta]: 3215, [aplazo]: 3557 })
})

test('volver a importar: reconoce por el id (lo creado en Matices) y, sin clave, por SKU', async () => {
  const pub = await mainList(CUBETA)
  const wall = await product(CUBETA, `ext_key = 'wall-cover-blanco'`)
  await importItems(CUBETA, [{ key: wall.id, name: 'WALL COVER PLUS 5 AÑOS - BLANCO' }])
  assert.equal((await product(CUBETA, `id = $2`, [wall.id])).name, 'WALL COVER PLUS 5 AÑOS - BLANCO')
  assert.equal((await product(CUBETA, `id = $2`, [wall.id])).ext_key, 'wall-cover-blanco')

  const r = await importItems(CUBETA, [{ sku: '1209054', name: '', category: 'IMPERMEABLES', prices: { [pub]: 3053 } }])
  assert.equal(r.updated, 1)
  const after = await product(CUBETA, `id = $2`, [wall.id])
  assert.equal(after.category, 'IMPERMEABLES')
  assert.equal(Number(after.prices[pub]), 3053)
  assert.equal((await one(`select count(*)::int as n from public.products where store_id = $1`, [CUBETA])).n, 2)
})

test('Litro: entran los que caben (200) y el resto se cuenta fuera; Cubeta no tiene límite', async () => {
  const pub = await mainList(LITRO)
  const items = Array.from({ length: 205 }, (_, i) => ({ key: `p-${i}`, name: `Producto ${i}`, prices: { [pub]: 10 + i } }))
  const r = await importItems(LITRO, items)
  assert.deepEqual(r, { created: 200, updated: 0, overLimit: 5, invalid: 0, limit: 200 })
  // Lleno: lo que ya existe se sigue actualizando
  const again = await importItems(LITRO, [{ key: 'p-0', name: 'Producto cero' }, { key: 'p-300', name: 'Nuevo' }])
  assert.deepEqual(again, { created: 0, updated: 1, overLimit: 1, invalid: 0, limit: 200 })
  // Un alta directa también se rechaza
  await assert.rejects(db.query(`insert into public.products (store_id, name) values ($1, 'Otro')`, [LITRO]), /PLAN_LIMIT:products:200/)

  const big = await importItems(CUBETA, Array.from({ length: 250 }, (_, i) => ({ key: `c-${i}`, name: `Cubeta ${i}` })))
  assert.equal(big.created, 250)
  assert.equal(big.limit, null)
})

test('borrar una lista quita sus precios de todos los productos; la principal no se borra', async () => {
  const pub = await mainList(CUBETA)
  const [aplazo] = await listsFor(CUBETA, ['Aplazo'])
  await one(`select public.delete_price_list($1, $2)`, [CUBETA, aplazo])
  const wall = await product(CUBETA, `ext_key = 'wall-cover-blanco'`)
  assert.equal(wall.prices[aplazo], undefined)
  assert.equal(Number(wall.prices[pub]), 3053)
  await assert.rejects(one(`select public.delete_price_list($1, $2)`, [CUBETA, pub]), /principal no se puede borrar/)
  await assert.rejects(one(`select public.delete_price_list($1, $2)`, [LITRO, pub]), /no encontrada/)
})

test('elegir la principal: solo una por tienda', async () => {
  const pub = await mainList(CUBETA)
  const [tarjeta] = await listsFor(CUBETA, ['Tarjeta'])
  await one(`select public.set_main_price_list($1, $2)`, [CUBETA, tarjeta])
  assert.equal(await mainList(CUBETA), tarjeta)
  await one(`select public.set_main_price_list($1, $2)`, [CUBETA, pub])
  assert.equal(await mainList(CUBETA), pub)
  assert.equal((await one(`select count(*)::int as n from public.price_lists where store_id = $1 and is_main`, [CUBETA])).n, 1)
})

test('buscar: cada palabra en cualquier dato, sin acentos, con filtros, orden y total', async () => {
  const pub = await mainList(CUBETA)
  await importItems(CUBETA, [
    { key: 'vini-iv1-galon', sku: '1301381', name: 'IPESA VINI+ PINTURA VINIL ACRILICA BASE IV1', unit: 'Galón', category: 'VINILICAS', brand: 'IPESA', prices: { [pub]: 294 } },
    { key: 'vini-iv1-cubeta', sku: '1201381', name: 'IPESA VINI+ PINTURA VINIL ACRILICA BASE IV1', unit: 'Cubeta', category: 'VINILICAS', brand: 'IPESA', prices: { [pub]: 1187 } },
    { key: 'rodillo', sku: 'KME4-3P', barcode: '7501127000360', name: 'BLISTER CON TRES MINIROLLOS', unit: 'Pieza', category: 'COMPLEMENTOS', brand: 'BROTIMEX' },
  ])
  const search = async (q, extra = {}) => (await one(`select public.search_products($1, $2, $3, $4, $5, $6, $7) as r`,
    [CUBETA, q, extra.category ?? null, extra.brand ?? null, extra.order ?? 'name', extra.limit ?? 50, extra.offset ?? 0])).r

  const vini = await search('vini galon')
  assert.equal(vini.total, 1)
  assert.equal(vini.rows[0].unit, 'Galón')
  assert.equal(vini.rows[0].store_id, undefined)
  assert.equal((await search('7501127000360')).rows[0].sku, 'KME4-3P')
  assert.equal((await search('vini', { category: 'COMPLEMENTOS' })).total, 0)
  assert.equal((await search('', { brand: 'BROTIMEX' })).total, 1)
  assert.equal((await search('100%_')).total, 0)

  const page = await search('', { limit: 2, offset: 0 })
  assert.equal(page.rows.length, 2)
  assert.ok(page.total > 250)
  const az = (await search('cubeta 1', { order: 'name' })).rows.map(r => r.name)
  assert.deepEqual(az, [...az].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en')))

  const counts = (await one(`select public.price_list_counts($1) as c`, [CUBETA])).c
  assert.equal(counts.total, page.total)
  assert.ok(counts.lists[pub] >= 3)

  const facets = (await one(`select public.product_facets($1) as f`, [CUBETA])).f
  assert.ok(facets.categories.includes('VINILICAS'))
  assert.ok(facets.units.includes('Galón'))
  assert.ok(facets.brands.includes('BROTIMEX'))
})

test('cotizaciones: la lista elegida debe ser de la tienda y al borrarla queda vacía', async () => {
  const [mayoreo] = await listsFor(CUBETA, ['Mayoreo'])
  const q = await one(`insert into public.quotes (store_id, folio, price_list_id) values ($1, 1, $2) returning id`, [CUBETA, mayoreo])
  await assert.rejects(db.query(`insert into public.quotes (store_id, folio, price_list_id) values ($1, 2, $2)`, [LITRO, mayoreo]), /foreign key/)
  await one(`select public.delete_price_list($1, $2)`, [CUBETA, mayoreo])
  assert.equal((await one(`select price_list_id from public.quotes where id = $1`, [q.id])).price_list_id, null)
})
