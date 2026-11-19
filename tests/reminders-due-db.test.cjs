const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

// El Worker de los avisos pregunta reminders_due() antes de despertar a la app:
// true solo si ya llegó la hora (local de su tienda) de algún recordatorio sin avisar.
const MX = '11111111-1111-4111-8111-111111111111'
const TOKYO = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const KEY = crypto.randomBytes(32).toString('hex')
const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8')
let db

before(async () => {
  db = await PGlite.create()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.stores (id uuid primary key, timezone text not null default 'America/Mexico_City');
    create table public.reminders (
      id serial primary key, store_id uuid not null references public.stores(id), user_id uuid,
      reminder_date timestamp not null, completado boolean not null default false, push_sent boolean not null default false
    );
  `)
  await db.exec(migration('20261029202246_cron_keys_reminder_push.sql'))
  await db.exec(migration('20261119204829_reminders_due_gate.sql'))
  await db.query(`insert into public.stores (id, timezone) values ($1, 'America/Mexico_City'), ($2, 'Asia/Tokyo')`, [MX, TOKYO])
  const hash = crypto.createHash('sha256').update(KEY).digest('hex')
  await db.query(`insert into public.cron_keys (name, key_hash) values ('cloudflare-avisos', $1)`, [hash])
})
after(async () => { await db?.close() })

/** Un recordatorio a `offset` (intervalo SQL) de la hora local actual de `zone`. */
async function only(store, zone, offset, extra = {}) {
  await db.exec('delete from public.reminders')
  await db.query(
    `insert into public.reminders (store_id, user_id, reminder_date, completado, push_sent)
     values ($1, $2, (now() at time zone $3) + $4::interval, $5, $6)`,
    [store, 'user_id' in extra ? extra.user_id : USER, zone, offset, extra.completado ?? false, extra.push_sent ?? false],
  )
}
const due = (key = KEY) => db.query('select public.reminders_due($1) as due', [key]).then(r => r.rows[0].due)

test('sin recordatorios no hay nada que avisar', async () => {
  await db.exec('delete from public.reminders')
  assert.equal(await due(), false)
})

test('true cuando ya llegó la hora, false si todavía no', async () => {
  await only(MX, 'America/Mexico_City', '-1 minute')
  assert.equal(await due(), true)
  await only(MX, 'America/Mexico_City', '1 hour')
  assert.equal(await due(), false)
})

test('compara con la hora local de la tienda de cada recordatorio', async () => {
  // Las 2 pm de Tokio ya pasaron en Tokio, pero en México todavía falta
  await only(TOKYO, 'Asia/Tokyo', '-1 minute')
  assert.equal(await due(), true)
  await only(MX, 'Asia/Tokyo', '-1 minute')
  assert.equal(await due(), false)
})

test('los muy atrasados cuentan (la app los marca sin mandarlos)', async () => {
  await only(MX, 'America/Mexico_City', '-3 days')
  assert.equal(await due(), true)
})

test('ignora completados, ya avisados y sin dueño', async () => {
  await only(MX, 'America/Mexico_City', '-1 minute', { completado: true })
  assert.equal(await due(), false)
  await only(MX, 'America/Mexico_City', '-1 minute', { push_sent: true })
  assert.equal(await due(), false)
  await only(MX, 'America/Mexico_City', '-1 minute', { user_id: null })
  assert.equal(await due(), false)
})

test('sin una llave válida responde error, nunca false', async () => {
  await only(MX, 'America/Mexico_City', '-1 minute')
  await assert.rejects(due(crypto.randomBytes(32).toString('hex')), /No autorizado/)
  await assert.rejects(due('no-es-una-llave'), /No autorizado/)
  await assert.rejects(due(null), /No autorizado/)
})
