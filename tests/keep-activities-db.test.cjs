const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// Fase 1: borrar un contacto conserva sus actividades (con su nombre) y quitar
// o desactivar a alguien del equipo nunca deja clientes a nombre de quien ya no está.
const STORE = '11111111-1111-4111-8111-111111111111'
const OTHER_STORE = '22222222-2222-4222-8222-222222222222'
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LUIS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PLANS = JSON.stringify({ litro: { maxUsers: 1, allowAdmins: false }, cubeta: { maxUsers: 10, allowAdmins: true } })
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let db

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const all = async (sql, params = []) => (await db.query(sql, params)).rows

before(async () => {
  db = await PGlite.create()
  // Lo mínimo de las tablas reales para las funciones y triggers de la migración
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stores (id uuid primary key, plan text not null default 'cubeta', paid_until timestamptz);
    create function public.store_effective_plan(p_plan text, p_paid_until timestamptz) returns text
      language sql immutable as $$ select p_plan $$;
    create table public.store_members (
      store_id uuid not null, user_id uuid not null, role text not null, status text not null default 'active',
      primary key (store_id, user_id));
    create table public.store_invitations (
      id uuid primary key default gen_random_uuid(), store_id uuid not null, invited_by uuid,
      accepted_at timestamptz, revoked_at timestamptz, expires_at timestamptz not null default now() + interval '7 days');
    create table public.contacts (
      id uuid primary key, store_id uuid not null, name text not null, company text, owner_id uuid,
      updated_at timestamptz, unique (store_id, id));
    create table public.commercial_activities (
      id uuid primary key default gen_random_uuid(), store_id uuid not null, contact_id uuid not null,
      user_id uuid, kind text not null, result text, sale_amount numeric, created_at timestamptz not null default now(),
      constraint commercial_activities_contact_same_store_fkey
        foreign key (store_id, contact_id) references public.contacts(store_id, id) on delete cascade);
    -- Trigger que ya existe en producción: desactivar suelta los clientes
    create function public.release_contacts_of_inactive_member() returns trigger language plpgsql as $$
    begin
      if new.status <> 'active' then
        update public.contacts set owner_id = null where store_id = new.store_id and owner_id = new.user_id;
      end if;
      return new;
    end $$;
    create trigger store_members_release_contacts after update of status on public.store_members
      for each row when (old.status is distinct from new.status) execute function public.release_contacts_of_inactive_member();
  `)
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261115033541_keep_activities_and_reassign_owners.sql'), 'utf8'))
})
after(async () => { await db?.close() })

async function reset() {
  await db.exec(`
    delete from public.commercial_activities; delete from public.contacts; delete from public.store_invitations;
    delete from public.store_members; delete from public.stores;
  `)
  await db.query(`insert into public.stores (id) values ($1), ($2)`, [STORE, OTHER_STORE])
  for (const [store, user, role] of [[STORE, ADMIN, 'admin'], [STORE, ANA, 'employee'], [STORE, LUIS, 'employee'], [OTHER_STORE, ANA, 'employee']]) {
    await db.query(`insert into public.store_members (store_id, user_id, role) values ($1, $2, $3)`, [store, user, role])
  }
  // Ana tiene 3 clientes en la tienda y 1 en otra; Luis tiene 1
  const contacts = [[1, STORE, ANA], [2, STORE, ANA], [3, STORE, ANA], [4, STORE, LUIS], [5, OTHER_STORE, ANA]]
  for (const [n, store, owner] of contacts) {
    await db.query(`insert into public.contacts (id, store_id, name, company, owner_id) values ($1, $2, $3, $4, $5)`,
      [uuid(n), store, `Cliente ${n}`, n === 1 ? 'Pinturas Juárez' : null, owner])
  }
}
const ownerOf = async n => (await one(`select owner_id from public.contacts where id = $1`, [uuid(n)])).owner_id
const manage = (target, { status = null, remove = false, ownerTo } = {}) => ownerTo === undefined
  ? db.query(`select public.manage_store_member($1, $2, $3, null, $4, $5, $6::jsonb)`, [STORE, ADMIN, target, status, remove, PLANS])
  : db.query(`select public.manage_store_member($1, $2, $3, null, $4, $5, $6::jsonb, $7)`, [STORE, ADMIN, target, status, remove, PLANS, ownerTo])

test('borrar un contacto conserva sus actividades con su nombre', async () => {
  await reset()
  await db.query(`insert into public.commercial_activities (store_id, contact_id, user_id, kind, result, sale_amount)
    values ($1, $2, $3, 'llamada', 'venta', 1500), ($1, $2, $3, 'llamada', 'contactado', null), ($1, $4, $3, 'visita', 'venta', 800)`,
  [STORE, uuid(1), ANA, uuid(2)])

  await db.query(`delete from public.contacts where id = $1`, [uuid(1)])

  const kept = await all(`select contact_id, contact_name, sale_amount from public.commercial_activities where contact_name is not null`)
  assert.equal(kept.length, 2, 'las dos actividades del contacto borrado siguen')
  assert.ok(kept.every(a => a.contact_id === null && a.contact_name === 'Pinturas Juárez'), 'sin contacto y con el nombre de la empresa')
  const total = await one(`select sum(sale_amount)::int as sold from public.commercial_activities where store_id = $1`, [STORE])
  assert.equal(total.sold, 2300, 'lo vendido no cambia')
  const other = await one(`select contact_id, contact_name from public.commercial_activities where sale_amount = 800`)
  assert.deepEqual(other, { contact_id: uuid(2), contact_name: null }, 'las de otros contactos no se tocan')
})

test('sin empresa guarda el nombre de la persona', async () => {
  await reset()
  await db.query(`insert into public.commercial_activities (store_id, contact_id, kind) values ($1, $2, 'nota')`, [STORE, uuid(3)])
  await db.query(`delete from public.contacts where id = $1`, [uuid(3)])
  assert.equal((await one(`select contact_name from public.commercial_activities`)).contact_name, 'Cliente 3')
})

test('quitar del equipo sin elegir a nadie deja sus clientes sin asignar', async () => {
  await reset()
  await manage(ANA, { remove: true })
  for (const n of [1, 2, 3]) assert.equal(await ownerOf(n), null)
  assert.equal(await ownerOf(4), LUIS, 'los de otros no cambian')
  assert.equal(await ownerOf(5), ANA, 'en otra tienda sigue siendo suya')
})

test('quitar del equipo pasando sus clientes a otra persona', async () => {
  await reset()
  await manage(ANA, { remove: true, ownerTo: LUIS })
  for (const n of [1, 2, 3, 4]) assert.equal(await ownerOf(n), LUIS)
  assert.equal(await one(`select 1 from public.store_members where store_id = $1 and user_id = $2`, [STORE, ANA]), undefined)
})

test('desactivar: a otra persona o, sin elegir, sin asignar', async () => {
  await reset()
  await manage(ANA, { status: 'disabled', ownerTo: ADMIN })
  for (const n of [1, 2, 3]) assert.equal(await ownerOf(n), ADMIN)

  await reset()
  await manage(ANA, { status: 'disabled' })
  for (const n of [1, 2, 3]) assert.equal(await ownerOf(n), null)
})

test('no se pasan a sí mismo, a alguien inactivo ni sin quitar o desactivar', async () => {
  await reset()
  await db.query(`update public.store_members set status = 'disabled' where store_id = $1 and user_id = $2`, [STORE, LUIS])
  await assert.rejects(manage(ANA, { remove: true, ownerTo: ANA }), /Elige a alguien activo/)
  await assert.rejects(manage(ANA, { remove: true, ownerTo: LUIS }), /Elige a alguien activo/)
  await assert.rejects(manage(ANA, { status: 'active', ownerTo: ADMIN }), /solo se pasan/)
  for (const n of [1, 2, 3]) assert.equal(await ownerOf(n), ANA, 'un error no mueve nada')
  assert.ok(await one(`select 1 from public.store_members where store_id = $1 and user_id = $2`, [STORE, ANA]), 'sigue en el equipo')
})

test('store_owner_counts cuenta los clientes de cada quien en la tienda', async () => {
  await reset()
  const rows = await all(`select owner_id, contacts::int as n from public.store_owner_counts($1) order by n desc`, [STORE])
  assert.deepEqual(rows, [{ owner_id: ANA, n: 3 }, { owner_id: LUIS, n: 1 }])
})
