const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Real PostgreSQL in memory. No Supabase URL, credentials or external service.
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PLANS = { litro: { maxUsers: 1, allowAdmins: false }, galon: { maxUsers: 3, allowAdmins: false }, cubeta: { maxUsers: 5, allowAdmins: true } }
let db
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
const claim = () => scalar('select public.claim_stripe_store($1)', [STORE])
const apply = (token, status = 'active', plan = 'cubeta', customer = 'cus_dummy') => scalar(
  'select public.apply_stripe_subscription($1,$2,$3,$4,$5,now()+interval \'1 month\',false,$6,$7)',
  [STORE, customer, 'sub_dummy', status, plan, JSON.stringify(PLANS), token],
)

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    grant usage on schema public to service_role, anon, authenticated;
    create table public.stores (
      id uuid primary key, stripe_customer_id text unique, stripe_subscription_id text unique,
      subscription_status text, current_period_end timestamptz, cancel_at_period_end boolean default false,
      plan text not null default 'litro', paid_until timestamptz, status text default 'active', updated_at timestamptz
    );
    create table public.store_members (store_id uuid, user_id uuid, role text, status text, created_at timestamptz);
    create table public.store_invitations (store_id uuid, role text, accepted_at timestamptz, revoked_at timestamptz, expires_at timestamptz);
    create table public.platform_events (store_id uuid, actor_id uuid, action text, detail jsonb);
    create table public.stripe_events (id text primary key, type text not null, received_at timestamptz default now(), processed_at timestamptz);
    alter table public.stores enable row level security;
    alter table public.stripe_events enable row level security;
    grant select, insert, update on all tables in schema public to service_role;
  `)
  const original = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261018141228_stripe_plans.sql'), 'utf8')
  for (const name of ['store_effective_plan', 'apply_stripe_subscription']) {
    const definition = original.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]
    await db.exec(definition)
  }
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261019232657_stripe_billing_reliability.sql'), 'utf8')
  await db.exec(migration)
})
after(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec(`reset role;
    truncate public.stores cascade; truncate public.stripe_events, public.platform_events,
      public.store_members, public.store_invitations, public.stripe_price_plans;
    insert into public.stores(id) values ('${STORE}'), ('${OTHER}');
    set role service_role;`)
})

test('only one store worker wins; an expired token cannot write or release its successor', async () => {
  const old = await claim()
  assert.ok(old)
  assert.equal(await claim(), null)
  await db.query("update public.stripe_billing_state set lock_until = now()-interval '1 second' where store_id=$1", [STORE])
  const fresh = await claim()
  assert.notEqual(fresh, old)
  await apply(fresh, 'canceled')
  await assert.rejects(apply(old), /lease expired/)
  await db.query('select public.release_stripe_store($1,$2)', [STORE, old])
  assert.equal(await claim(), null)
  assert.equal(await scalar('select plan from public.stores where id=$1', [STORE]), 'litro')
  await db.query('select public.release_stripe_store($1,$2)', [STORE, fresh])
  assert.ok(await claim())
})

test('expired leases cannot commit, even before another worker acquires the store', async () => {
  const token = await claim()
  await db.query("update public.stripe_billing_state set lock_until=now()-interval '1 second'")
  await assert.rejects(apply(token), /lease expired/)
  await assert.rejects(apply(null), /lease expired/)
})

test('customer binding returns the saved customer and rejects expired workers', async () => {
  const token = await claim()
  const bind = id => scalar('select public.bind_stripe_customer($1,$2,$3)', [STORE, token, id])
  assert.equal(await bind('cus_first'), 'cus_first')
  assert.equal(await bind('cus_loser'), 'cus_first')
  await db.query("update public.stripe_billing_state set lock_until=now()-interval '1 second'")
  await assert.rejects(bind('cus_expired'), /lease expired/)
})

test('event claim, crash recovery, fencing and successful deduplication use real SQL', async () => {
  const first = await scalar("select public.claim_stripe_event('evt_dummy','invoice.paid')")
  assert.equal(first.status, 'claimed')
  assert.equal((await scalar("select public.claim_stripe_event('evt_dummy','invoice.paid')")).status, 'busy')
  await db.query("update public.stripe_events set processing_until=now()-interval '1 second'")
  assert.equal(await scalar("select public.finish_stripe_event('evt_dummy',$1,true)", [first.token]), false)
  const next = await scalar("select public.claim_stripe_event('evt_dummy','invoice.paid')")
  assert.notEqual(first.token, next.token)
  assert.equal(await scalar("select public.finish_stripe_event('evt_dummy',$1,false)", [first.token]), false)
  assert.equal(await scalar("select public.finish_stripe_event('evt_dummy',$1,true)", [next.token]), true)
  assert.equal((await scalar("select public.claim_stripe_event('evt_dummy','invoice.paid')")).status, 'processed')
})

test('a failed event can be retried immediately and is not acknowledged as processed', async () => {
  const first = await scalar("select public.claim_stripe_event('evt_dummy','invoice.paid')")
  assert.equal(await scalar("select public.finish_stripe_event('evt_dummy',$1,false)", [first.token]), true)
  assert.equal(await scalar("select processed_at from public.stripe_events where id='evt_dummy'"), null)
  assert.equal((await scalar("select public.claim_stripe_event('evt_dummy','invoice.paid')")).status, 'claimed')
})

test('Checkout parameters and attempt IDs cannot change underneath an in-flight request', async () => {
  const token = await claim()
  const params = JSON.stringify({ customer: 'cus_dummy', expires_at: 1800000000 })
  const save = (id, payload = params, session = null) => db.query(
    'select public.save_stripe_checkout($1,$2,$3,$4,$5,false)', [STORE, token, id, payload, session])
  await save(STORE)
  await assert.rejects(save(OTHER), /attempt changed/)
  await assert.rejects(save(STORE, '{}'), /request changed/)
  await save(STORE, params, 'cs_dummy')
  await assert.rejects(save(STORE), /request changed/)
  await db.query('select public.save_stripe_checkout($1,$2,$3,$4,$5,true)', [STORE, token, STORE, params, 'cs_dummy'])
  await save(OTHER)
})

test('unknown plans and mismatched customers fail without modifying the store', async () => {
  const token = await claim()
  await assert.rejects(apply(token, 'active', null), /Plan de Stripe desconocido/)
  await apply(token)
  await assert.rejects(apply(token, 'active', 'galon', 'cus_other'), /no corresponde/)
  assert.equal(await scalar('select plan from public.stores where id=$1', [STORE]), 'cubeta')
})

test('past_due grace expires, duplicate failures do not extend it, and payment restores access', async () => {
  const token = await claim()
  await apply(token)
  await apply(token, 'past_due')
  assert.ok(await scalar('select paid_until from public.stores where id=$1', [STORE]))
  await db.query("update public.stores set paid_until=now()-interval '4 days' where id=$1", [STORE])
  const start = await scalar('select paid_until::text from public.stores where id=$1', [STORE])
  await apply(token, 'past_due')
  assert.equal(await scalar('select paid_until::text from public.stores where id=$1', [STORE]), start)
  assert.equal(await scalar('select public.store_effective_plan(plan,paid_until) from public.stores where id=$1', [STORE]), 'litro')
  await apply(token)
  assert.equal(await scalar('select paid_until from public.stores where id=$1', [STORE]), null)
  assert.equal(await scalar('select plan from public.stores where id=$1', [STORE]), 'cubeta')
  await apply(token, 'paused')
  assert.equal(await scalar('select plan from public.stores where id=$1', [STORE]), 'litro')
})

test('billing functions and tables are inaccessible to browser roles', async () => {
  const { rows } = await db.query(`select p.oid::regprocedure::text as name,
    has_function_privilege('anon',p.oid,'execute') as anon,
    has_function_privilege('authenticated',p.oid,'execute') as authenticated
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '%stripe%' or p.proname='save_stripe_checkout')`)
  assert.ok(rows.length >= 7)
  for (const row of rows) { assert.equal(row.anon, false, row.name); assert.equal(row.authenticated, false, row.name) }
  assert.equal(await scalar("select to_regprocedure('public.apply_stripe_subscription(uuid,text,text,text,text,timestamptz,boolean,jsonb)')"), null)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${role};`)
    await assert.rejects(db.query('select * from public.stripe_billing_state'), /permission denied/)
    await assert.rejects(db.query('select public.claim_stripe_store($1)', [STORE]), /permission denied/)
    await assert.rejects(db.query("insert into public.stripe_price_plans values ('price_fake','cubeta')"), /permission denied/)
  }
})

test('historical price mappings are immutable to the service role', async () => {
  await db.query("insert into public.stripe_price_plans values ('price_old','galon') on conflict (price_id) do nothing")
  await db.query("insert into public.stripe_price_plans values ('price_old','cubeta') on conflict (price_id) do nothing")
  assert.equal(await scalar("select plan from public.stripe_price_plans where price_id='price_old'"), 'galon')
  await assert.rejects(db.query("update public.stripe_price_plans set plan='cubeta' where price_id='price_old'"), /permission denied/)
})
