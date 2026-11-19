const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Cotizaciones (1.58.0): folio por tienda, enviar registra «Cotización enviada»
// una sola vez, aceptar puede registrar la venta, y nada se pierde al borrar un contacto.
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LUIS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATIONS = path.join(__dirname, '../supabase/migrations')
let db

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
/** PGlite devuelve las fechas como Date: AAAA-MM-DD para comparar. */
const day = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v)
const all = async (sql, params = []) => (await db.query(sql, params)).rows

/** log_commercial_activity tal como está en producción (de su migración). */
function logActivitySql() {
  const src = fs.readFileSync(path.join(MIGRATIONS, '20261108015335_commercial_email_activity.sql'), 'utf8')
  const start = src.indexOf('create or replace function public.log_commercial_activity(')
  const end = src.indexOf('end $$;', start) + 'end $$;'.length
  assert.ok(start >= 0 && end > start, 'no se encontró log_commercial_activity')
  return src.slice(start, end)
}

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    insert into auth.users values ('${ANA}'), ('${LUIS}');
    create table public.stores (id uuid primary key, name text);
    insert into public.stores values ('${STORE}', 'Pinturas'), ('${OTHER}', 'Otra');
    create table public.contacts (
      id uuid primary key, store_id uuid not null, name text not null, company text, owner_id uuid,
      commercial_status text not null default 'nuevo', next_action text, next_action_at date,
      last_activity_at timestamptz, last_result text, last_note text, no_answer_streak int not null default 0,
      updated_at timestamptz, unique (store_id, id));
    create table public.commercial_activities (
      id uuid primary key default gen_random_uuid(), store_id uuid not null, contact_id uuid,
      user_id uuid, kind text not null, result text, note text, quote_amount numeric(12,2), sale_amount numeric(12,2),
      next_action text, next_action_at date, is_followup boolean not null default false,
      created_at timestamptz not null default now(),
      foreign key (store_id, contact_id) references public.contacts(store_id, id) on delete set null (contact_id));
    -- Lo que dejó el cotizador anterior (se borra)
    create table public.paint_products (id uuid primary key);
    create table public.project_quotes (id uuid primary key);
    create function public.create_project_quote(p uuid) returns void language sql as $$ select $$;
  `)
  await db.exec(logActivitySql())
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, '20261118053424_quotes.sql'), 'utf8'))
})
after(async () => { await db?.close() })

let seq = 0
async function newQuote({ store = STORE, contact = null, total = 1000, issued = '2026-11-10', valid = '2026-11-25', items = [] } = {}) {
  const { folio } = await one(`select public.next_quote_folio($1) as folio`, [store])
  return one(`insert into public.quotes (store_id, folio, created_by, contact_id, client_name, items, issued_on, valid_until, total, share_token)
    values ($1, $2, $3, $4, 'Cliente', $5::jsonb, $6, $7, $8, $9) returning *`,
    [store, folio, ANA, contact, JSON.stringify(items), issued, valid, total, `token-${String(++seq).padStart(20, '0')}`])
}
async function newContact(n, status = 'nuevo') {
  await db.query(`insert into public.contacts (id, store_id, name, commercial_status) values ($1, $2, $3, $4)`, [uuid(n), STORE, `Contacto ${n}`, status])
  return uuid(n)
}
const send = (q, via = 'whatsapp', kind = 'whatsapp', today = '2026-11-17', actor = ANA) =>
  one(`select * from public.send_quote($1, $2, $3, $4, $5, $6)`, [STORE, actor, q, via, kind, today])
const decide = (q, status, sale = false, kind = 'whatsapp', today = '2026-11-20') =>
  one(`select * from public.decide_quote($1, $2, $3, $4, $5, $6, $7)`, [STORE, LUIS, q, status, sale, kind, today])

test('borra el cotizador anterior', async () => {
  const left = await all(`select table_name from information_schema.tables where table_name in ('paint_products', 'project_quotes')`)
  assert.deepEqual(left, [])
  assert.equal((await one(`select count(*)::int as n from pg_proc where proname = 'create_project_quote'`)).n, 0)
})

test('folio consecutivo por tienda, sin repetirse aunque se borre una', async () => {
  const a = await newQuote(), b = await newQuote()
  const x = await newQuote({ store: OTHER })
  assert.equal(b.folio, a.folio + 1)
  assert.equal(x.folio, 1)
  await db.query(`delete from public.quotes where id = $1`, [b.id])
  const c = await newQuote()
  assert.equal(c.folio, b.folio + 1)
  await assert.rejects(db.query(`insert into public.quotes (store_id, folio, issued_on, valid_until, share_token) values ($1, $2, '2026-11-17', '2026-11-30', 'otro-token-123456789012')`, [STORE, a.folio]), /unique/)
})

test('enviar: la fecha pasa a hoy (conserva los días de validez) y registra la cotización una sola vez', async () => {
  const c = await newContact(1)
  const q = await newQuote({ contact: c, total: 3099.6 })
  const sent = await send(q.id)
  assert.equal(sent.status, 'sent')
  assert.equal(sent.sent_via, 'whatsapp')
  assert.ok(sent.sent_at)
  assert.equal(day(sent.issued_on), '2026-11-17')
  assert.equal(day(sent.valid_until), '2026-12-02')
  const act = await one(`select * from public.commercial_activities where id = $1`, [sent.activity_id])
  assert.equal(act.result, 'cotizacion')
  assert.equal(Number(act.quote_amount), 3099.6)
  assert.equal(act.kind, 'whatsapp')
  assert.equal(act.note, `Cotización #${q.folio}`)
  const contact = await one(`select * from public.contacts where id = $1`, [c])
  assert.equal(contact.commercial_status, 'cotizacion')
  assert.equal(contact.owner_id, ANA)
  assert.equal(contact.next_action, 'Confirmar la cotización')
  assert.equal(day(contact.next_action_at), '2026-11-19')

  // Reenviar después de cambiar el total: misma actividad, monto nuevo, fechas iguales
  await db.query(`update public.quotes set total = 3500 where id = $1`, [q.id])
  const again = await send(q.id, 'correo', 'correo', '2026-11-18')
  assert.equal(again.activity_id, sent.activity_id)
  assert.equal(day(again.issued_on), '2026-11-17')
  assert.equal(again.sent_via, 'correo')
  assert.equal((await one(`select count(*)::int as n from public.commercial_activities where contact_id = $1`, [c])).n, 1)
  assert.equal(Number((await one(`select quote_amount from public.commercial_activities where id = $1`, [sent.activity_id])).quote_amount), 3500)
})

test('enviar a un Cliente no lo regresa a Cotización', async () => {
  const c = await newContact(2, 'cliente')
  const q = await newQuote({ contact: c })
  await send(q.id)
  assert.equal((await one(`select commercial_status from public.contacts where id = $1`, [c])).commercial_status, 'cliente')
})

test('sin contacto: se marca enviada y no toca el sistema comercial', async () => {
  const before = (await one(`select count(*)::int as n from public.commercial_activities`)).n
  const q = await newQuote()
  const sent = await send(q.id, 'en_persona', 'visita')
  assert.equal(sent.status, 'sent')
  assert.equal(sent.activity_id, null)
  assert.equal((await one(`select count(*)::int as n from public.commercial_activities`)).n, before)
})

test('aceptar con venta (una sola vez), reabrir y rechazar', async () => {
  const c = await newContact(3)
  const q = await newQuote({ contact: c, total: 2000 })
  await assert.rejects(decide(q.id, 'accepted'), /Primero envía/)
  await send(q.id)
  const accepted = await decide(q.id, 'accepted', true)
  assert.equal(accepted.status, 'accepted')
  assert.ok(accepted.decided_at)
  const sale = await one(`select * from public.commercial_activities where id = $1`, [accepted.sale_activity_id])
  assert.equal(sale.result, 'venta')
  assert.equal(Number(sale.sale_amount), 2000)
  const contact = await one(`select commercial_status, next_action, next_action_at, owner_id from public.contacts where id = $1`, [c])
  assert.deepEqual({ ...contact, next_action_at: day(contact.next_action_at) }, { commercial_status: 'cliente', next_action: 'Ofrecer recompra', next_action_at: '2026-12-20', owner_id: LUIS })

  await assert.rejects(send(q.id), /aceptada o rechazada/)
  const reopened = await decide(q.id, 'sent')
  assert.equal(reopened.status, 'sent')
  assert.equal(reopened.decided_at, null)
  await decide(q.id, 'accepted', true)
  assert.equal((await one(`select count(*)::int as n from public.commercial_activities where contact_id = $1 and result = 'venta'`, [c])).n, 1)

  const r = await newQuote({ contact: c })
  await send(r.id)
  const statusBefore = (await one(`select commercial_status from public.contacts where id = $1`, [c])).commercial_status
  const rejected = await decide(r.id, 'rejected', true)
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.sale_activity_id, null)
  assert.equal((await one(`select commercial_status from public.contacts where id = $1`, [c])).commercial_status, statusBefore)
})

test('al borrar el contacto la cotización se queda con sus datos', async () => {
  const c = await newContact(4)
  const q = await newQuote({ contact: c })
  await db.query(`delete from public.contacts where id = $1`, [c])
  const kept = await one(`select contact_id, client_name from public.quotes where id = $1`, [q.id])
  assert.deepEqual(kept, { contact_id: null, client_name: 'Cliente' })
})

test('no se puede ligar a un contacto de otra tienda', async () => {
  await db.query(`insert into public.contacts (id, store_id, name) values ($1, $2, 'Ajeno')`, [uuid(9), OTHER])
  await assert.rejects(newQuote({ contact: uuid(9) }), /foreign key/)
})

test('sugerencias: lo ya cotizado en la tienda, sin repetir, con el último precio', async () => {
  await db.query(`delete from public.quotes`)
  const old = await newQuote({ items: [{ description: 'Vinílica Blanco Mate', unit: 'cubeta', price: 1200 }, { description: 'Rodillo 9"', unit: 'pza', price: 145 }] })
  await db.query(`update public.quotes set updated_at = now() - interval '1 day' where id = $1`, [old.id])
  await newQuote({ items: [{ description: 'vinílica blanco mate ', unit: 'cubeta', price: 1336.03 }, { description: '', price: 5 }, { description: 'Sellador 100%', unit: 'L', price: 90 }] })
  await newQuote({ store: OTHER, items: [{ description: 'Vinílica de otra tienda', price: 1 }] })

  const list = await all(`select * from public.quote_item_suggestions($1, $2, 8)`, [STORE, 'vinílica'])
  assert.deepEqual(list.map(r => [r.description, r.unit, Number(r.price)]), [['vinílica blanco mate', 'cubeta', 1336.03]])
  assert.equal((await all(`select * from public.quote_item_suggestions($1, '', 8)`, [STORE])).length, 3)
  // % y _ se buscan como texto, no como comodines
  assert.deepEqual((await all(`select description from public.quote_item_suggestions($1, '100%', 8)`, [STORE])).map(r => r.description), ['Sellador 100%'])
  assert.equal((await all(`select * from public.quote_item_suggestions($1, '_', 8)`, [STORE])).length, 0)
})
