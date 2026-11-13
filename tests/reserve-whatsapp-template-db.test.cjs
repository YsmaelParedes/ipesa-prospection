const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// reserve_whatsapp_template: la reserva que hace la salida de WhatsApp antes de
// mandar cada plantilla (bajas, espera tras un 131049, límite de Meta y
// permisos), con la versión vigente de la migración.
const STORE = '11111111-1111-4111-8111-111111111111'
const ADMIN = 'a0000000-0000-4000-8000-000000000001'
const SELLER = 'a0000000-0000-4000-8000-000000000002'
const ANA = 'c0000000-0000-4000-8000-000000000001'
const MIGRATIONS = path.join(__dirname, '../supabase/migrations')

let db
before(async () => {
  db = await PGlite.create()
  const effectivePlan = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS)
    .filter(f => /create or replace function public\.store_effective_plan/i.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))).sort().pop()), 'utf8')
    .match(/create or replace function public\.store_effective_plan[\s\S]*?\$\$;/i)[0]
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stores (id uuid primary key, plan text not null default 'cubeta', paid_until timestamptz,
      modules jsonb not null default '{"whatsapp": true}', status text not null default 'active');
    create table public.store_members (store_id uuid, user_id uuid, role text, status text default 'active');
    create table public.contacts (id uuid primary key, store_id uuid not null, phone text, wa_opt_out boolean not null default false);
    create table public.whatsapp_messages (
      id uuid primary key default gen_random_uuid(), store_id uuid not null, user_id uuid, contact_id uuid,
      phone text not null, direction text not null, template_name text, body text, status text not null default 'sent',
      outside_window boolean, error_code integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    ${effectivePlan}
  `)
  const reserve = fs.readdirSync(MIGRATIONS).filter(f => /function public\.reserve_whatsapp_template/i.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))).sort().pop()
  await db.exec(fs.readFileSync(path.join(MIGRATIONS, reserve), 'utf8'))
})
after(() => db?.close())

beforeEach(async () => {
  await db.exec(`
    truncate stores, store_members, contacts, whatsapp_messages;
    insert into stores (id) values ('${STORE}');
    insert into store_members values ('${STORE}', '${ADMIN}', 'admin', 'active'), ('${STORE}', '${SELLER}', 'seller', 'active');
    insert into contacts values ('${ANA}', '${STORE}', '522221112233', false);
  `)
})

async function reserve({ actor = ADMIN, phone = '2221112233', contact = null, limit = 250, marketing = true } = {}) {
  const { rows } = await db.query('select public.reserve_whatsapp_template($1,$2,$3,$4,$5,$6,$7,$8) as r',
    [STORE, actor, phone, 'promo', 'Hola', contact, limit, marketing])
  return rows[0].r
}
const sent = (phone, errorCode = null) => db.query(
  `insert into whatsapp_messages (store_id, phone, direction, template_name, status, error_code) values ($1, $2, 'outbound', 'x', 'sent', $3)`,
  [STORE, phone, errorCode])

test('reserva: deja la plantilla pendiente en el historial, fuera de la ventana', async () => {
  const r = await reserve({ contact: ANA })
  assert.equal(r.allowed, true)
  const { rows } = await db.query('select phone, status, outside_window, contact_id, user_id, template_name from whatsapp_messages')
  assert.deepEqual(rows, [{ phone: '2221112233', status: 'pending', outside_window: true, contact_id: ANA, user_id: ADMIN, template_name: 'promo' }])
})

test('reserva: el contacto se reconoce por sus últimos 10 dígitos; otro número no es el contacto', async () => {
  assert.equal((await reserve({ contact: ANA, phone: '2221112233' })).allowed, true)
  await assert.rejects(reserve({ contact: ANA, phone: '2229998877' }), /Contacto no encontrado/)
})

test('baja: por el contacto o por el número', async () => {
  await db.exec(`update contacts set wa_opt_out = true`)
  assert.deepEqual(await reserve({ contact: ANA }), { allowed: false, reason: 'opt_out' })
  await db.exec(`insert into contacts values (gen_random_uuid(), '${STORE}', '2225550000', true)`)
  assert.deepEqual(await reserve({ phone: '2225550000' }), { allowed: false, reason: 'opt_out' })
})

test('tras un 131049 se espera 24 h, solo para marketing', async () => {
  await sent('2221112233', 131049)
  assert.deepEqual(await reserve(), { allowed: false, reason: 'marketing_limit' })
  assert.equal((await reserve({ marketing: false })).allowed, true)
  await db.exec(`update whatsapp_messages set updated_at = now() - interval '25 hours' where error_code = 131049`)
  assert.equal((await reserve()).allowed, true)
})

test('límite de Meta: personas distintas en 24 h fuera de la ventana', async () => {
  await sent('5500000001'); await sent('5500000002')
  assert.deepEqual(await reserve({ limit: 2 }), { allowed: false, reason: 'quota' })
  // A quien ya se le contó hoy no gasta otro lugar
  assert.equal((await reserve({ limit: 2, phone: '5500000001' })).allowed, true)
  // Los rechazados por Meta no cuentan
  await db.exec(`update whatsapp_messages set status = 'failed' where phone = '5500000002'`)
  assert.equal((await reserve({ limit: 2 })).allowed, true)
  // Sin límite (null), siempre
  assert.equal((await reserve({ limit: null, phone: '5500000009' })).allowed, true)
})

test('límite de Meta: quien escribió en las últimas 24 h no cuenta', async () => {
  await sent('5500000001'); await sent('5500000002')
  await db.exec(`insert into whatsapp_messages (store_id, phone, direction) values ('${STORE}', '2221112233', 'inbound')`)
  const r = await reserve({ limit: 2 })
  assert.equal(r.allowed, true)
  const { rows } = await db.query(`select outside_window from whatsapp_messages where id = $1`, [r.id])
  assert.equal(rows[0].outside_window, false)
})

test('permisos: solo administradores, con WhatsApp activo y en Cubeta', async () => {
  await assert.rejects(reserve({ actor: SELLER }), /Sin permisos/)
  await db.exec(`update stores set modules = '{"whatsapp": false}'`)
  await assert.rejects(reserve(), /WhatsApp desactivado/)
  await db.exec(`update stores set modules = '{"whatsapp": true}', plan = 'galon'`)
  await assert.rejects(reserve(), /plan Cubeta/)
  await db.exec(`update stores set plan = 'cubeta', paid_until = now() - interval '4 days'`)
  await assert.rejects(reserve(), /plan Cubeta/)
  await db.exec(`update stores set paid_until = null, status = 'suspended'`)
  await assert.rejects(reserve(), /solo lectura/)
})
