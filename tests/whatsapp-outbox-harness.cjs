// Banco de pruebas de la salida de WhatsApp: base en memoria con la forma de
// PostgREST (lo justo para el envío) y Meta simulado con fetch. Las rutas y
// lib/ se cargan tal cual; solo se reemplazan supabase-server y errorReport.
require('./register-typescript.cjs')
const Module = require('node:module')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// Alias "@/..." de tsconfig
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) request = path.join(ROOT, request.slice(2))
  return resolve.call(this, request, ...rest)
}
function resolveTs(rel) {
  const base = path.join(ROOT, rel)
  return require.resolve(base.endsWith('.ts') ? base : `${base}.ts`)
}

const STORE = '11111111-1111-4111-8111-111111111111'
const UID = '22222222-2222-4222-8222-222222222222'

// ── Base en memoria ─────────────────────────────────────────────────────────
const db = { tables: { contacts: [], whatsapp_messages: [], store_whatsapp: [] }, rpcs: [], seq: 0 }
const now = () => new Date().toISOString()
const uuid = () => `00000000-0000-4000-8000-${String(++db.seq).padStart(12, '0')}`

function query(table) {
  const filters = []
  let op = 'select'; let patch = null; let rows = null; let single = false
  let order = null; let range = null; let max = null
  const q = {
    select() { return q },
    eq(c, v) { filters.push(r => r[c] === v); return q },
    neq(c, v) { filters.push(r => r[c] !== v); return q },
    in(c, vs) { filters.push(r => vs.includes(r[c])); return q },
    gte(c, v) { filters.push(r => r[c] >= v); return q },
    lt(c, v) { filters.push(r => r[c] < v); return q },
    is(c, v) { filters.push(r => (r[c] ?? null) === v); return q },
    not(c, opName, v) { filters.push(r => !((r[c] ?? null) === v)); return q },
    order(c, { ascending = true } = {}) { order ??= { c, ascending }; return q },
    range(a, b) { range = [a, b]; return q },
    limit(n) { max = n; return q },
    insert(list) { op = 'insert'; rows = list; return q },
    update(p) { op = 'update'; patch = p; return q },
    maybeSingle() { single = true; return q.then(x => x) },
    then(resolve, reject) {
      try {
        const table_ = db.tables[table] ??= []
        if (op === 'insert') {
          const made = rows.map(r => ({ id: uuid(), created_at: now(), ...r }))
          table_.push(...made)
          return Promise.resolve({ data: made, error: null }).then(resolve, reject)
        }
        let hits = table_.filter(r => filters.every(f => f(r)))
        if (op === 'update') {
          hits.forEach(r => Object.assign(r, patch))
          return Promise.resolve({ data: hits, error: null }).then(resolve, reject)
        }
        if (order) hits = [...hits].sort((a, b) => (a[order.c] < b[order.c] ? -1 : a[order.c] > b[order.c] ? 1 : 0) * (order.ascending ? 1 : -1))
        if (range) hits = hits.slice(range[0], range[1] + 1)
        if (max !== null) hits = hits.slice(0, max)
        const data = single ? hits[0] ?? null : hits
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      } catch (error) { return Promise.reject(error).then(resolve, reject) }
    },
  }
  return q
}

// Misma lógica que la función SQL reserve_whatsapp_template (la SQL real se prueba en PGLite)
function reserve(p) {
  db.rpcs.push(p)
  const last10 = s => String(s).replace(/\D/g, '').slice(-10)
  const contacts = db.tables.contacts.filter(c => c.store_id === p.p_store)
  if (p.p_contact && !contacts.some(c => c.id === p.p_contact && (c.phone === p.p_phone || last10(c.phone) === last10(p.p_phone)))) {
    return { data: null, error: Object.assign(new Error('Contacto no encontrado'), { code: 'P0002' }) }
  }
  if (contacts.some(c => c.wa_opt_out && (c.id === p.p_contact || c.phone === p.p_phone))) return { data: { allowed: false, reason: 'opt_out' }, error: null }
  const msgs = db.tables.whatsapp_messages.filter(m => m.store_id === p.p_store)
  if (p.p_marketing && msgs.some(m => m.phone === p.p_phone && m.direction === 'outbound' && m.error_code === 131049)) {
    return { data: { allowed: false, reason: 'marketing_limit' }, error: null }
  }
  const outside = !msgs.some(m => m.phone === p.p_phone && m.direction === 'inbound')
  const counted = m => m.direction === 'outbound' && m.template_name && m.status !== 'failed' && m.outside_window !== false
  if (outside && p.p_limit !== null && !msgs.some(m => m.phone === p.p_phone && counted(m))) {
    if (new Set(msgs.filter(counted).map(m => m.phone)).size >= p.p_limit) return { data: { allowed: false, reason: 'quota' }, error: null }
  }
  const row = { id: uuid(), created_at: now(), store_id: p.p_store, user_id: p.p_actor, contact_id: p.p_contact, phone: p.p_phone, direction: 'outbound', template_name: p.p_template, body: p.p_body, status: 'pending', outside_window: outside }
  db.tables.whatsapp_messages.push(row)
  return { data: { allowed: true, id: row.id }, error: null }
}

const supabase = {
  from: query,
  rpc: async (name, params) => {
    if (name !== 'reserve_whatsapp_template') throw new Error(`rpc sin simular: ${name}`)
    return reserve(params)
  },
}

// ── Sesión ──────────────────────────────────────────────────────────────────
const session = { ctx: null }
function ctxFor(over = {}) {
  return {
    uid: UID, storeId: STORE, role: 'admin', isAdmin: true, plan: 'cubeta',
    modules: { whatsapp: true, campaigns: true, formulas: false }, store: { timezone: 'America/Mexico_City' }, ...over,
  }
}

const reported = []
function mock(rel, exports) {
  const id = resolveTs(rel)
  require.cache[id] = { id, filename: id, loaded: true, exports }
}
mock('lib/supabase-server', {
  getServerSupabase: () => supabase,
  getTestUserIds: async storeId => new Set((db.tables.store_members ?? []).filter(m => m.store_id === storeId && m.is_test).map(m => m.user_id)),
  requireStore: async (opts = {}) => {
    const ctx = session.ctx
    if (!ctx) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 })
    if (opts.module && !ctx.modules[opts.module]) return new Response(JSON.stringify({ error: 'Módulo' }), { status: 403 })
    return ctx
  },
})
mock('lib/errorReport', { reportError: e => { reported.push(e) } })

// ── Meta simulado ───────────────────────────────────────────────────────────
const meta = { sent: [], uploads: [], health: { tier: 'TIER_1K', canSend: 'AVAILABLE' }, failFor: new Map(), uploadFails: false }
let wamid = 0
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url))
  if (u.hostname !== 'graph.facebook.com') throw new Error(`fetch inesperado: ${url}`)
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  if (u.pathname.endsWith('/messages')) {
    const payload = JSON.parse(init.body)
    meta.sent.push(payload)
    const fail = meta.failFor.get(payload.to)
    if (fail) return json({ error: { code: fail, message: `error ${fail}` } }, 400)
    return json({ messages: [{ id: `wamid.${++wamid}` }] })
  }
  if (u.pathname.endsWith('/media')) {
    meta.uploads.push(init.body)
    return meta.uploadFails ? json({ error: { code: 100, message: 'bad' } }, 400) : json({ id: 'media-1' })
  }
  const fields = u.searchParams.get('fields') ?? ''
  if (fields.startsWith('display_phone_number')) return json({ display_phone_number: '+52 222 000 0000', verified_name: 'Tienda', quality_rating: 'GREEN', name_status: 'APPROVED' })
  if (fields === 'whatsapp_business_manager_messaging_limit') return json({ whatsapp_business_manager_messaging_limit: meta.health.tier })
  if (fields === 'health_status') return json({ health_status: { can_send_message: meta.health.canSend, entities: [] } })
  return json({})
}

process.env.WHATSAPP_ACCESS_TOKEN = 'token'
process.env.WHATSAPP_PHONE_NUMBER_ID = `pn-${process.pid}-${Date.now()}`

function reset({ connected = true } = {}) {
  for (const t of Object.keys(db.tables)) db.tables[t] = []
  db.rpcs.length = 0
  wamid = 0; meta.sent.length = 0; meta.uploads.length = 0; meta.failFor.clear(); meta.uploadFails = false
  meta.health = { tier: 'TIER_1K', canSend: 'AVAILABLE' }
  reported.length = 0
  session.ctx = ctxFor()
  if (connected) db.tables.store_whatsapp.push({ store_id: STORE, credentials_source: 'env', verify_token: 'v', webhook_key: 'k', connection_method: 'manual' })
}

function addContact(over = {}) {
  const c = { id: uuid(), store_id: STORE, name: 'Ana López', phone: '2221112233', wa_opt_out: false, line_type: null, ...over }
  db.tables.contacts.push(c)
  return c
}

function jsonRequest(url, body, headers = {}) {
  const { NextRequest } = require('next/server')
  return new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })
}

function loadRoute(rel) { return require(resolveTs(rel)) }

module.exports = { STORE, UID, db, meta, session, reported, reset, addContact, jsonRequest, loadRoute, ctxFor, resolveTs }
