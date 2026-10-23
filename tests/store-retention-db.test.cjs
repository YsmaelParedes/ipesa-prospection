const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Eliminación de tiendas inactivas, en PostgreSQL real en memoria (sin Supabase).
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SHARED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const IDLE = 183
let db
const row = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const scalar = async (sql, args = []) => Object.values(await row(sql, args))[0]
const status = id => row('select * from public.store_retention_status($1) where id = $2', [IDLE, id])
const del = id => scalar('select public.delete_inactive_store($1, $2)', [id, IDLE])
const due = id => db.query("update public.stores set deletion_notices = 2, deletion_scheduled_for = now() - interval '1 day' where id = $1", [id])

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role, anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
    create table public.stores (
      id uuid primary key, slug text not null, name text not null, created_at timestamptz not null default now(),
      plan text not null default 'litro', paid_until timestamptz, status text default 'active', subscription_status text
    );
    create table public.store_members (store_id uuid references public.stores(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, role text, status text);
    create table public.contacts (store_id uuid references public.stores(id) on delete cascade, updated_at timestamptz);
    create table public.commercial_activities (store_id uuid references public.stores(id) on delete cascade, created_at timestamptz);
    create table public.whatsapp_messages (store_id uuid references public.stores(id) on delete cascade, created_at timestamptz);
    create table public.platform_admins (user_id uuid primary key);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261021120000_store_retention.sql'), 'utf8'))
  await db.exec('grant select, insert, update, delete on all tables in schema public to service_role;')
})
after(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`reset role;
    truncate public.stores cascade; truncate auth.users cascade; truncate public.store_deletions, public.platform_admins;
    insert into public.stores (id, slug, name, created_at) values
      ('${STORE}', 'vieja', 'Tienda vieja', now() - interval '1 year'),
      ('${OTHER}', 'otra', 'Otra tienda', now() - interval '1 year');
    insert into auth.users (id, email, last_sign_in_at) values
      ('${OWNER}', 'dueno@x.mx', now() - interval '1 year'), ('${SHARED}', 'socio@x.mx', null), ('${ADMIN}', 'yo@x.mx', null);
    insert into public.platform_admins values ('${ADMIN}');
    insert into public.store_members values
      ('${STORE}', '${OWNER}', 'admin', 'active'), ('${STORE}', '${SHARED}', 'employee', 'active'),
      ('${OTHER}', '${SHARED}', 'admin', 'active'), ('${STORE}', '${ADMIN}', 'employee', 'active');
    set role service_role;`)
})

test('a free store unused for six months is a candidate and lists its admins', async () => {
  const s = await status(STORE)
  assert.equal(s.idle, true)
  assert.equal(s.protected, false)
  assert.deepEqual(s.admin_emails, ['dueno@x.mx'])
})

test('any recent use keeps it: sign-in, contact, activity, WhatsApp or opening the CRM', async () => {
  const uses = [
    `update auth.users set last_sign_in_at = now() where id = '${OWNER}'`,
    `insert into public.contacts values ('${STORE}', now())`,
    `insert into public.commercial_activities values ('${STORE}', now())`,
    `insert into public.whatsapp_messages values ('${STORE}', now())`,
    `select public.touch_store_seen('${STORE}')`,
  ]
  for (const sql of uses) {
    await db.exec(`reset role; ${sql}; set role service_role;`)
    assert.equal((await status(STORE)).idle, false, sql)
    await db.exec(`reset role;
      update auth.users set last_sign_in_at = now() - interval '1 year';
      truncate public.contacts, public.commercial_activities, public.whatsapp_messages;
      update public.stores set last_seen_at = null; set role service_role;`)
  }
})

test('paying, courtesy, internal and excluded stores are never deleted', async () => {
  const cases = [
    "subscription_status = 'active'", "subscription_status = 'past_due'", "subscription_status = 'trialing'",
    "plan = 'galon'", "plan = 'cubeta', paid_until = now() + interval '1 month'", "plan = 'interno'", 'retention_hold = true',
  ]
  for (const set of cases) {
    await db.query("update public.stores set plan = 'litro', paid_until = null, subscription_status = null, retention_hold = false where id = $1", [STORE])
    await db.query(`update public.stores set ${set} where id = $1`, [STORE])
    await due(STORE)
    assert.equal((await status(STORE)).protected, true, set)
    assert.equal((await del(STORE)).reason, 'protected', set)
  }
  // Galón a mano vencido (más los 3 días de gracia) ya es Litro: sí se puede eliminar
  await db.query("update public.stores set retention_hold = false, plan = 'galon', paid_until = now() - interval '10 days' where id = $1", [STORE])
  assert.equal((await status(STORE)).protected, false)
})

test('nothing is deleted before both notices and the scheduled date', async () => {
  assert.equal((await del(STORE)).reason, 'not_due')
  await db.query("update public.stores set deletion_notices = 1, deletion_scheduled_for = now() - interval '1 day' where id = $1", [STORE])
  assert.equal((await del(STORE)).reason, 'not_due')
  await db.query("update public.stores set deletion_notices = 2, deletion_scheduled_for = now() + interval '1 day' where id = $1", [STORE])
  assert.equal((await del(STORE)).reason, 'not_due')
  assert.equal(await scalar('select count(*)::int from public.stores'), 2)
})

test('opening the store cancels the countdown and blocks the deletion', async () => {
  await due(STORE)
  await db.query('select public.touch_store_seen($1)', [STORE])
  const s = await row('select deletion_notices, deletion_scheduled_for from public.stores where id = $1', [STORE])
  assert.equal(s.deletion_notices, 0)
  assert.equal(s.deletion_scheduled_for, null)
  await due(STORE)
  assert.equal((await del(STORE)).reason, 'active')
})

test('a due store is deleted with its data and only its now-orphan non-admin accounts are returned', async () => {
  await db.exec(`reset role; insert into public.contacts values ('${STORE}', now() - interval '1 year'); set role service_role;`)
  await due(STORE)
  const r = await del(STORE)
  assert.equal(r.deleted, true)
  assert.deepEqual(r.orphans, [OWNER])  // el socio sigue en otra tienda y el administrador se conserva
  assert.equal(await scalar('select count(*)::int from public.stores where id = $1', [STORE]), 0)
  assert.equal(await scalar('select count(*)::int from public.contacts'), 0)
  assert.equal(await scalar('select count(*)::int from public.stores where id = $1', [OTHER]), 1)
  const log = await row('select store_name, store_slug, reason, users_deleted from public.store_deletions')
  assert.deepEqual(log, { store_name: 'Tienda vieja', store_slug: 'vieja', reason: 'inactive', users_deleted: 1 })
})

test('anon and authenticated cannot call the functions', async () => {
  await db.exec('reset role; set role authenticated;')
  await assert.rejects(db.query('select * from public.store_retention_status(1)'), /permission denied/)
  await assert.rejects(db.query('select public.delete_inactive_store($1, 1)', [STORE]), /permission denied/)
  await assert.rejects(db.query('select public.touch_store_seen($1)', [STORE]), /permission denied/)
})
