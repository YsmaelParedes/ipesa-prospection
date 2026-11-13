const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// La tabla whatsapp_thread_state (mantenida por triggers) debe dar exactamente lo
// mismo que la vista original, que recalculaba todo en cada consulta.
const STORES = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const PHONES = ['5212220000001', '5212220000002', '5212220000003', '5212220000004', '5212220000005']
const CONTACTS = ['c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002']
const REFERENCE_VIEW = `
  create view public.whatsapp_threads_reference as
  SELECT DISTINCT ON (store_id, phone) phone, body AS last_body, direction AS last_direction, status AS last_status,
    media_type AS last_media_type, template_name AS last_template, created_at AS last_at,
    (SELECT count(*)::integer FROM whatsapp_messages u WHERE u.store_id = m.store_id AND u.phone = m.phone AND u.direction = 'inbound' AND u.read_at IS NULL) AS unread,
    (SELECT max(i.created_at) FROM whatsapp_messages i WHERE i.store_id = m.store_id AND i.phone = m.phone AND i.direction = 'inbound') AS last_inbound_at,
    (SELECT p.profile_name FROM whatsapp_messages p WHERE p.store_id = m.store_id AND p.phone = m.phone AND p.profile_name IS NOT NULL ORDER BY p.created_at DESC LIMIT 1) AS profile_name,
    (SELECT c.contact_id FROM whatsapp_messages c WHERE c.store_id = m.store_id AND c.phone = m.phone AND c.contact_id IS NOT NULL ORDER BY c.created_at DESC LIMIT 1) AS contact_id,
    store_id
  FROM whatsapp_messages m ORDER BY store_id, phone, created_at DESC;`

let db, seq = 0, seed = 42
const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
const pick = a => a[rand(a.length)]
// Fechas únicas y crecientes (con algunas viejas) para que "el último" no empate
const when = () => new Date(Date.UTC(2026, 10, 1) + (++seq) * 60_000 - (rand(5) === 0 ? 86_400_000 * 30 : 0)).toISOString()

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stores (id uuid primary key);
    create table public.contacts (id uuid primary key, store_id uuid not null references stores(id) on delete cascade, unique (store_id, id));
    create table public.whatsapp_messages (
      id uuid primary key default gen_random_uuid(), contact_id uuid, phone text not null,
      direction text not null check (direction in ('inbound','outbound')), body text, wa_message_id text,
      status text not null default 'sent', template_name text, created_at timestamptz not null default now(),
      read_at timestamptz, media_type text, profile_name text,
      store_id uuid not null references stores(id) on delete cascade,
      foreign key (store_id, contact_id) references contacts(store_id, id) on delete set null (contact_id)
    );
    insert into stores values ('${STORES[0]}'), ('${STORES[1]}');
    insert into contacts values ('${CONTACTS[0]}', '${STORES[0]}'), ('${CONTACTS[1]}', '${STORES[0]}');
  `)
  // Mensajes previos a la migración: la carga inicial debe cubrirlos
  for (let i = 0; i < 25; i++) await insertOne()
  await db.exec(REFERENCE_VIEW)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261113032150_whatsapp_thread_state.sql'), 'utf8'))
})
after(() => db?.close())

async function insertOne(store = pick(STORES)) {
  const inbound = rand(2) === 0
  const contact = store === STORES[0] && rand(3) === 0 ? pick(CONTACTS) : null
  await db.query(
    `insert into whatsapp_messages (store_id, phone, direction, body, status, created_at, media_type, profile_name, template_name, contact_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [store, pick(PHONES), inbound ? 'inbound' : 'outbound', rand(4) ? `msg ${seq}` : null, inbound ? 'received' : 'sent',
     when(), rand(5) === 0 ? 'image' : null, inbound && rand(2) ? `Perfil ${rand(3)}` : null,
     !inbound && rand(4) === 0 ? 'bienvenida' : null, contact])
}

const OPS = [
  ['un mensaje nuevo', () => insertOne()],
  ['un lote de campaña', async () => {
    const values = [], params = []
    for (const phone of PHONES) { params.push(STORES[0], phone, when()); values.push(`($${params.length - 2}, $${params.length - 1}, 'outbound', 'campaña', 'sent', $${params.length}, 'promo')`) }
    await db.query(`insert into whatsapp_messages (store_id, phone, direction, body, status, created_at, template_name) values ${values.join(',')}`, params)
  }],
  ['estados entregado/leído en lote', () => db.query(`update whatsapp_messages set status = $1 where direction = 'outbound' and store_id = $2 and status <> 'read'`, [pick(['delivered', 'read']), pick(STORES)])],
  ['marcar un chat como leído', () => db.query(`update whatsapp_messages set read_at = now() where store_id = $1 and phone = $2 and direction = 'inbound' and read_at is null`, [pick(STORES), pick(PHONES)])],
  ['ligar un contacto', () => db.query(`update whatsapp_messages set contact_id = $1 where store_id = $2 and phone = $3`, [pick(CONTACTS), STORES[0], pick(PHONES)])],
  ['borrar un contacto (deja contact_id en null)', async () => {
    const id = pick(CONTACTS)
    await db.query(`delete from contacts where id = $1`, [id])
    await db.query(`insert into contacts values ($1, $2)`, [id, STORES[0]])
  }],
  ['borrar un mensaje', () => db.query(`delete from whatsapp_messages where id = (select id from whatsapp_messages order by created_at desc limit 1)`)],
  ['borrar un chat completo', () => db.query(`delete from whatsapp_messages where store_id = $1 and phone = $2`, [pick(STORES), pick(PHONES)])],
]

async function assertSame(step) {
  const cols = 'store_id, phone, last_body, last_direction, last_status, last_media_type, last_template, last_at, unread, last_inbound_at, profile_name, contact_id'
  const ref = (await db.query(`select ${cols} from whatsapp_threads_reference order by store_id, phone`)).rows
  const got = (await db.query(`select ${cols} from whatsapp_threads order by store_id, phone`)).rows
  assert.deepEqual(got, ref, `distinto después de: ${step}`)
}

test('la carga inicial da lo mismo que la vista anterior', async () => {
  await assertSame('carga inicial')
})

test('600 operaciones al azar mantienen las conversaciones iguales a la vista anterior', async () => {
  for (let i = 0; i < 600; i++) {
    const [name, run] = OPS[rand(OPS.length)]
    await run()
    await assertSame(`${i}: ${name}`)
  }
})

test('borrar la tienda borra sus conversaciones', async () => {
  await insertOne(STORES[1])
  await db.query(`delete from stores where id = $1`, [STORES[1]])
  const { rows } = await db.query(`select count(*)::int n from whatsapp_thread_state where store_id = $1`, [STORES[1]])
  assert.equal(rows[0].n, 0)
  await assertSame('borrar tienda')
})

test('la lista y los no leídos usan la tabla, no recorren mensajes', async () => {
  const { rows } = await db.query(`explain select * from whatsapp_threads where store_id = $1 and unread > 0 order by last_at desc limit 51`, [STORES[0]])
  const plan = rows.map(r => r['QUERY PLAN']).join('\n')
  assert.match(plan, /whatsapp_thread_state/)
  assert.doesNotMatch(plan, /whatsapp_messages/)
})
