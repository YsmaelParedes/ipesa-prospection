const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Cotizaciones subidas (entrega 2): sin folio de Matices y con su archivo; al
// enviarlas, aceptarlas o rechazarlas, Comercial dice «Cotización subida».
const STORE = '11111111-1111-4111-8111-111111111111'
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATIONS = path.join(__dirname, '../supabase/migrations')
let db

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const all = async (sql, params = []) => (await db.query(sql, params)).rows
const day = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v)
const migrationFile = suffix => {
  const f = fs.readdirSync(MIGRATIONS).find(x => x.endsWith(suffix))
  assert.ok(f, `falta la migración ${suffix}`)
  return fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
}

/** log_commercial_activity como estaba antes de la entrega 1 (la entrega 1 la redefine). */
function logActivitySql() {
  const src = fs.readFileSync(path.join(MIGRATIONS, '20261108015335_commercial_email_activity.sql'), 'utf8')
  const start = src.indexOf('create or replace function public.log_commercial_activity(')
  const end = src.indexOf('end $$;', start) + 'end $$;'.length
  return src.slice(start, end)
}

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    insert into auth.users values ('${ANA}');
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table public.stores (id uuid primary key, name text);
    insert into public.stores values ('${STORE}', 'Pinturas');
    create table public.contacts (
      id uuid primary key, store_id uuid not null, name text not null, company text, owner_id uuid,
      commercial_status text not null default 'nuevo', next_action text, next_action_at date,
      last_activity_at timestamptz, last_result text, last_note text, no_answer_streak int not null default 0,
      updated_at timestamptz, unique (store_id, id));
    create table public.commercial_activities (
      id uuid primary key default gen_random_uuid(), store_id uuid not null, contact_id uuid,
      user_id uuid, kind text not null, result text, note text, quote_amount numeric(12,2), sale_amount numeric(12,2),
      next_action text, next_action_at date, is_followup boolean not null default false,
      created_at timestamptz not null default clock_timestamp(),
      foreign key (store_id, contact_id) references public.contacts(store_id, id) on delete set null (contact_id));
    create table public.paint_products (id uuid primary key);
    create table public.project_quotes (id uuid primary key);
    create function public.create_project_quote(p uuid) returns void language sql as $$ select $$;
  `)
  await db.exec(logActivitySql())
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, '20261118053424_quotes.sql'), 'utf8'))
  await db.exec(migrationFile('_observaciones_comercial.sql'))
  await db.exec(migrationFile('_cotizaciones_subidas.sql'))
})
after(async () => { await db?.close() })

let n = 0
async function newContact() {
  const id = uuid(++n)
  await db.query(`insert into public.contacts (id, store_id, name) values ($1, $2, $3)`, [id, STORE, `Cliente ${n}`])
  return id
}
const filePath = (ext = 'pdf') => `${STORE}/${uuid(9000 + ++n)}.${ext}`

/** Una cotización subida (borrador, como la deja la ruta antes de send_quote). */
async function uploaded(contact, { total = 4250.5, ext = 'pdf', mime = 'application/pdf' } = {}) {
  const id = uuid(5000 + ++n)
  await db.query(`insert into public.quotes
      (id, store_id, folio, created_by, contact_id, client_name, items, issued_on, valid_until, subtotal, total, share_token,
       file_path, file_name, file_mime, file_size)
    values ($1, $2, null, $3, $4, 'Cliente', '[]', '2026-11-21', '2026-12-06', $5, $5, $6, $7, 'Cotizacion Pulpos 88.pdf', $8, 123456)`,
  [id, STORE, ANA, contact, total, `tok-${id}-xxxxxxxx`, filePath(ext), mime])
  return id
}
const send = (quote, via = 'whatsapp', kind = 'whatsapp') =>
  one(`select * from public.send_quote($1, $2, $3, $4, $5, '2026-11-21')`, [STORE, ANA, quote, via, kind])
const activities = contact => all(`select result, note, quote_amount, sale_amount, next_action, next_action_at
  from public.commercial_activities where contact_id = $1 order by created_at`, [contact])

test('el espacio de archivos es privado, de hasta 10 MB y solo PDF, JPG o PNG', async () => {
  const b = await one(`select * from storage.buckets where id = 'quote-files'`)
  assert.equal(b.public, false)
  assert.equal(Number(b.file_size_limit), 10 * 1024 * 1024)
  assert.deepEqual(b.allowed_mime_types, ['application/pdf', 'image/jpeg', 'image/png'])
})

test('una subida enviada registra «Cotización subida» con su total y el seguimiento a 2 días', async () => {
  const c = await newContact()
  const q = await send(await uploaded(c))
  assert.equal(q.status, 'sent')
  assert.equal(q.folio, null)
  assert.equal(q.sent_via, 'whatsapp')
  const [a] = await activities(c)
  assert.equal(a.result, 'cotizacion')
  assert.equal(a.note, 'Cotización subida')
  assert.equal(Number(a.quote_amount), 4250.5)
  assert.equal(a.next_action, 'Confirmar la cotización')
  assert.equal(day(a.next_action_at), '2026-11-23')
  assert.equal((await one(`select commercial_status from public.contacts where id = $1`, [c])).commercial_status, 'cotizacion')
})

test('aceptar o rechazar una subida lo dice en Comercial', async () => {
  const c1 = await newContact()
  const q1 = await send(await uploaded(c1, { total: 900 }))
  await one(`select * from public.decide_quote($1, $2, $3, 'accepted', true, 'whatsapp', '2026-11-22')`, [STORE, ANA, q1.id])
  const sold = (await activities(c1)).at(-1)
  assert.equal(sold.note, 'Cotización subida aceptada')
  assert.equal(Number(sold.sale_amount), 900)

  const c2 = await newContact()
  const q2 = await send(await uploaded(c2))
  await one(`select * from public.decide_quote($1, $2, $3, 'rejected', true, 'whatsapp', '2026-11-22')`, [STORE, ANA, q2.id])
  const lost = (await activities(c2)).at(-1)
  assert.equal(lost.result, 'no_interesado')
  assert.equal(lost.note, 'Cotización subida rechazada')
})

test('una cotización de Matices sigue diciendo su folio', async () => {
  const c = await newContact()
  const id = uuid(7000)
  await db.query(`insert into public.quotes (id, store_id, folio, created_by, contact_id, client_name, items, issued_on, valid_until, total, share_token)
    values ($1, $2, 31, $3, $4, 'Cliente', '[]', '2026-11-21', '2026-12-06', 100, 'tok-matices-31-xxxxxxxx')`, [id, STORE, ANA, c])
  await send(id)
  assert.equal((await activities(c))[0].note, 'Cotización #31')
})

test('una cotización es de Matices (con folio) o subida (con su archivo completo)', async () => {
  const c = await newContact()
  const base = `insert into public.quotes (store_id, folio, contact_id, client_name, issued_on, valid_until, share_token,
    file_path, file_name, file_mime, file_size) values ($1, $2, $3, 'X', '2026-11-21', '2026-12-06', $4, $5, $6, $7, $8)`
  const tok = () => `tok-check-${++n}-xxxxxxxxxxxx`
  // Sin folio y sin archivo
  await assert.rejects(db.query(base, [STORE, null, c, tok(), null, null, null, null]), /quotes_folio_or_file/)
  // Con folio y con archivo
  await assert.rejects(db.query(base, [STORE, 99, c, tok(), filePath(), 'a.pdf', 'application/pdf', 10]), /quotes_folio_or_file/)
  // Archivo a medias
  await assert.rejects(db.query(base, [STORE, null, c, tok(), filePath(), 'a.pdf', null, 10]), /quotes_folio_or_file/)
  // Ruta que no armó el servidor, tipo no permitido o más de 10 MB
  await assert.rejects(db.query(base, [STORE, null, c, tok(), `${STORE}/../otra.pdf`, 'a.pdf', 'application/pdf', 10]), /check/)
  await assert.rejects(db.query(base, [STORE, null, c, tok(), filePath(), 'a.gif', 'image/gif', 10]), /check/)
  await assert.rejects(db.query(base, [STORE, null, c, tok(), filePath(), 'a.pdf', 'application/pdf', 10485761]), /check/)
  // Una foto bien formada sí entra
  await db.query(base, [STORE, null, c, tok(), filePath('jpg'), 'foto.jpg', 'image/jpeg', 2048])
})
