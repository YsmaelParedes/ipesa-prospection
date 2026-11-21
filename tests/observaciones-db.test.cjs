const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Observaciones de una tienda (entrega 1): cambiar la fecha del seguimiento sin
// registrar actividad, corregir montos, borrar la última actividad dejando al
// cliente como estaba y «Rechazada» que registra «No interesado».
const STORE = '11111111-1111-4111-8111-111111111111'
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LUIS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MIGRATIONS = path.join(__dirname, '../supabase/migrations')
let db

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const all = async (sql, params = []) => (await db.query(sql, params)).rows
const day = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v)

/** log_commercial_activity tal como estaba antes de esta migración. */
function logActivitySql() {
  const src = fs.readFileSync(path.join(MIGRATIONS, '20261108015335_commercial_email_activity.sql'), 'utf8')
  const start = src.indexOf('create or replace function public.log_commercial_activity(')
  const end = src.indexOf('end $$;', start) + 'end $$;'.length
  assert.ok(start >= 0 && end > start, 'no se encontró log_commercial_activity')
  return src.slice(start, end)
}
const migration = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_observaciones_comercial.sql'))

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    insert into auth.users values ('${ANA}'), ('${LUIS}');
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
  assert.ok(migration, 'falta la migración de observaciones')
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, migration), 'utf8'))
})
after(async () => { await db?.close() })

let n = 0
async function newContact(fields = {}) {
  const id = uuid(++n)
  await db.query(`insert into public.contacts (id, store_id, name, owner_id, commercial_status, next_action, next_action_at)
    values ($1, $2, $3, $4, $5, $6, $7)`,
  [id, STORE, `Cliente ${n}`, fields.owner ?? null, fields.status ?? 'nuevo', fields.action ?? null, fields.at ?? null])
  return id
}
const log = (contact, { kind = 'llamada', result = 'contactado', quote = null, sale = null, action = 'Dar seguimiento', at = '2026-11-25', status = 'contactado', actor = ANA } = {}) =>
  one(`select * from public.log_commercial_activity($1, $2, $3, $4, $5, null, $6, $7, $8, $9, $10, false)`,
    [STORE, actor, contact, kind, result, quote, sale, action, at, status])
const contact = id => one(`select * from public.contacts where id = $1`, [id])
const events = id => all(`select kind, detail, user_id from public.commercial_events where contact_id = $1 order by created_at`, [id])

test('cada actividad guarda cómo estaba el cliente antes', async () => {
  const c = await newContact({ status: 'nuevo', action: 'Llamar', at: '2026-11-21' })
  const a = await log(c, { result: 'cotizacion', quote: 32500, status: 'cotizacion', action: 'Confirmar la cotización' })
  assert.equal(a.prev_state.commercial_status, 'nuevo')
  assert.equal(a.prev_state.next_action, 'Llamar')
  assert.equal(a.prev_state.next_action_at, '2026-11-21')
  assert.equal(a.prev_state.owner_id, null)
  assert.equal((await contact(c)).commercial_status, 'cotizacion')
})

test('cambiar la fecha no registra actividad y deja rastro', async () => {
  const c = await newContact({ owner: ANA, status: 'cotizacion', action: 'Confirmar la cotización', at: '2026-11-22' })
  const after = await one(`select * from public.commercial_set_followup($1, $2, $3, $4, $5, $6)`,
    [STORE, LUIS, c, '2026-11-29', null, 'Fecha cambiada del 22 al 29 nov'])
  assert.equal(day(after.next_action_at), '2026-11-29')
  assert.equal(after.next_action, 'Confirmar la cotización')
  assert.equal(after.commercial_status, 'cotizacion')
  assert.equal(after.owner_id, ANA)
  assert.equal(after.last_activity_at, null)
  assert.equal((await one(`select count(*)::int as n from public.commercial_activities where contact_id = $1`, [c])).n, 0)
  assert.deepEqual(await events(c), [{ kind: 'fecha', detail: 'Fecha cambiada del 22 al 29 nov', user_id: LUIS }])

  // Con texto nuevo; sin fecha no se puede
  const visit = await one(`select * from public.commercial_set_followup($1, $2, $3, $4, $5, $6)`, [STORE, ANA, c, '2026-12-01', '  Visitar  ', 'x'])
  assert.equal(visit.next_action, 'Visitar')
  await assert.rejects(db.query(`select public.commercial_set_followup($1, $2, $3, null, null, 'x')`, [STORE, ANA, c]), /Elige la fecha/)
})

test('poner fecha a un cliente sin seguimiento usa «Dar seguimiento»', async () => {
  const c = await newContact()
  const after = await one(`select * from public.commercial_set_followup($1, $2, $3, $4, null, 'Fecha puesta')`, [STORE, ANA, c, '2026-11-30'])
  assert.equal(after.next_action, 'Dar seguimiento')
})

test('corregir un monto cambia la cotización o la venta y deja rastro', async () => {
  const c = await newContact()
  const q = await log(c, { result: 'cotizacion', quote: 701249.77, status: 'cotizacion' })
  const fixed = await one(`select * from public.commercial_fix_amount($1, $2, $3, $4, $5)`, [STORE, LUIS, q.id, 7012.5, 'Monto corregido'])
  assert.equal(Number(fixed.quote_amount), 7012.5)
  assert.equal(fixed.sale_amount, null)
  const s = await log(c, { result: 'venta', sale: 100, status: 'cliente' })
  const fixedSale = await one(`select * from public.commercial_fix_amount($1, $2, $3, $4, $5)`, [STORE, LUIS, s.id, 120, 'Venta corregida'])
  assert.equal(Number(fixedSale.sale_amount), 120)
  assert.equal(fixedSale.quote_amount, null)
  assert.equal((await events(c)).length, 2)

  const plain = await log(c, { result: 'contactado' })
  await assert.rejects(db.query(`select public.commercial_fix_amount($1, $2, $3, 10, 'x')`, [STORE, LUIS, plain.id]), /no tiene monto/)
  await assert.rejects(db.query(`select public.commercial_fix_amount($1, $2, $3, 0, 'x')`, [STORE, LUIS, q.id]), /mayor que cero/)
})

test('borrar la última actividad deja al cliente como estaba', async () => {
  const c = await newContact({ status: 'nuevo' })
  await log(c, { result: 'contactado', status: 'contactado', action: 'Dar seguimiento', at: '2026-11-23' })
  const before = await contact(c)
  const q = await log(c, { kind: 'whatsapp', result: 'cotizacion', quote: 32500, status: 'cotizacion', action: 'Confirmar la cotización', at: '2026-11-25' })
  assert.equal((await contact(c)).commercial_status, 'cotizacion')

  const restored = await one(`select * from public.commercial_delete_last_activity($1, $2, $3, null, $4)`, [STORE, LUIS, q.id, 'Borró Cotización enviada'])
  assert.equal(restored.commercial_status, 'contactado')
  assert.equal(restored.next_action, 'Dar seguimiento')
  assert.equal(day(restored.next_action_at), '2026-11-23')
  assert.equal(restored.owner_id, before.owner_id)
  assert.equal(new Date(restored.last_activity_at).getTime(), new Date(before.last_activity_at).getTime())
  assert.equal((await one(`select count(*)::int as n from public.commercial_activities where id = $1`, [q.id])).n, 0)
  assert.equal((await events(c)).at(-1).kind, 'borrado')
})

test('solo se puede borrar la más reciente', async () => {
  const c = await newContact()
  const first = await log(c, { result: 'contactado' })
  await log(c, { result: 'no_contesta', status: null })
  await assert.rejects(db.query(`select public.commercial_delete_last_activity($1, $2, $3, null, 'x')`, [STORE, LUIS, first.id]), /más reciente/)
})

test('una actividad anterior a la migración usa el estado que calcula la API', async () => {
  const c = await newContact({ status: 'nuevo' })
  const old = await log(c, { result: 'cotizacion', quote: 32500, status: 'cotizacion' })
  await db.query(`update public.commercial_activities set prev_state = null where id = $1`, [old.id])
  await assert.rejects(db.query(`select public.commercial_delete_last_activity($1, $2, $3, null, 'x')`, [STORE, LUIS, old.id]), /cómo estaba/)
  const restore = { commercial_status: 'nuevo', next_action: null, next_action_at: null, last_activity_at: null, last_result: null, last_note: null, no_answer_streak: 0 }
  const after = await one(`select * from public.commercial_delete_last_activity($1, $2, $3, $4::jsonb, 'x')`, [STORE, LUIS, old.id, JSON.stringify(restore)])
  assert.equal(after.commercial_status, 'nuevo')
  assert.equal(after.next_action_at, null)
  // Sin owner_id en lo que manda la API, el responsable se conserva
  assert.equal(after.owner_id, ANA)
})

test('borrar el contacto borra su historial de cambios', async () => {
  const c = await newContact()
  await db.query(`select public.commercial_set_followup($1, $2, $3, '2026-11-30', null, 'x')`, [STORE, ANA, c])
  await db.query(`delete from public.contacts where id = $1`, [c])
  assert.equal((await events(c)).length, 0)
})

test('Rechazada puede registrar «No interesado» una sola vez', async () => {
  const c = await newContact()
  const { folio } = await one(`select public.next_quote_folio($1) as folio`, [STORE])
  const q = await one(`insert into public.quotes (store_id, folio, created_by, contact_id, client_name, items, issued_on, valid_until, total, share_token)
    values ($1, $2, $3, $4, 'Cliente', '[]'::jsonb, '2026-11-10', '2026-11-25', 1500, 'token-observaciones-0001') returning *`, [STORE, folio, ANA, c])
  await one(`select * from public.send_quote($1, $2, $3, 'whatsapp', 'whatsapp', '2026-11-17')`, [STORE, ANA, q.id])
  const decide = (status, register) => one(`select * from public.decide_quote($1, $2, $3, $4, $5, 'whatsapp', '2026-11-20')`, [STORE, ANA, q.id, status, register])

  const rejected = await decide('rejected', true)
  assert.ok(rejected.lost_activity_id)
  const lost = await one(`select * from public.commercial_activities where id = $1`, [rejected.lost_activity_id])
  assert.equal(lost.result, 'no_interesado')
  assert.equal(lost.note, `Cotización #${folio} rechazada`)
  assert.equal((await contact(c)).commercial_status, 'no_interesado')
  assert.equal(day((await contact(c)).next_action_at), '2027-02-18')

  // Reabrir y volver a rechazar no la registra otra vez
  await decide('sent', false)
  const again = await decide('rejected', true)
  assert.equal(again.lost_activity_id, rejected.lost_activity_id)
  assert.equal((await one(`select count(*)::int as n from public.commercial_activities where contact_id = $1 and result = 'no_interesado'`, [c])).n, 1)
})

test('Rechazada sin marcar la casilla no toca Comercial', async () => {
  const c = await newContact()
  const { folio } = await one(`select public.next_quote_folio($1) as folio`, [STORE])
  const q = await one(`insert into public.quotes (store_id, folio, created_by, contact_id, client_name, items, issued_on, valid_until, total, share_token)
    values ($1, $2, $3, $4, 'Cliente', '[]'::jsonb, '2026-11-10', '2026-11-25', 900, 'token-observaciones-0002') returning *`, [STORE, folio, ANA, c])
  await one(`select * from public.send_quote($1, $2, $3, 'whatsapp', 'whatsapp', '2026-11-17')`, [STORE, ANA, q.id])
  const r = await one(`select * from public.decide_quote($1, $2, $3, 'rejected', false, 'whatsapp', '2026-11-20')`, [STORE, ANA, q.id])
  assert.equal(r.lost_activity_id, null)
  assert.equal((await contact(c)).commercial_status, 'cotizacion')
})
