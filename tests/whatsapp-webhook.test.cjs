require('./register-typescript.cjs')
const path = require('node:path')
const { test } = require('node:test')
const assert = require('node:assert/strict')

// Base simulada: guarda lo que se inserta y lo que se actualiza
const inserted = []
const updated = []
function query(table) {
  const q = {
    select: () => q, eq: () => q, in: () => q, limit: () => q,
    maybeSingle: async () => ({ data: null }),
    insert: async rows => { inserted.push(...rows.map(r => ({ table, ...r }))); return { error: null } },
    update: patch => { updated.push({ table, ...patch }); return q },
    then: resolve => resolve({ data: [], error: null }),
  }
  return q
}
function mock(file, exports) {
  const id = path.join(__dirname, '..', 'lib', file)
  require.cache[id] = { id, filename: id, loaded: true, exports }
}
mock('supabase-server.ts', { getServerSupabase: () => ({ from: query }) })
mock('push.ts', { configureWebPush: () => false, sendPushToSubscriptions: async () => {} })
mock('whatsappQuota.ts', { markOptOut: async () => {} })

const { processChange, parseInbound, UNSUPPORTED_TEXT } = require('../lib/whatsappWebhook.ts')

const STORE = 'store-1'
const meta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '5212220000000', phone_number_id: '123' } }

test('un mensaje normal se guarda y avisa al equipo', async () => {
  inserted.length = 0
  const notifications = await processChange(STORE, {
    ...meta,
    contacts: [{ profile: { name: 'Luis' }, wa_id: '5212224445566' }],
    messages: [{ from: '5212224445566', id: 'wamid.N', timestamp: '1792700000', type: 'text', text: { body: 'Hola' } }],
  })
  assert.equal(inserted.length, 1)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].title, 'Luis')
})

test('los estados entregado y leído se guardan', async () => {
  updated.length = 0
  await processChange(STORE, { ...meta, statuses: [{ id: 'wamid.S', status: 'delivered' }, { id: 'wamid.S', status: 'read' }] })
  assert.ok(updated.some(u => u.status === 'delivered'))
  assert.ok(updated.some(u => u.status === 'read'))
})

test('sin agente de IA: los bloques standby y los traspasos de chat se ignoran', async () => {
  inserted.length = 0
  const n = await processChange(STORE, {
    ...meta,
    standby: { message_echoes: [{ id: 'wamid.X', message: { type: 'text', to: '5212221112233', text: { body: 'Solicitaré a un representante que responda.' } } }] },
  })
  const passed = await processChange(STORE, {
    type: 'control_passed', sender: { phone_number: '5212221112233' }, recipient: { phone_number_id: '123' },
    control_passed: { previous_owner_role: 'ai_agent', new_owner_role: 'escalation' },
  })
  assert.equal(inserted.length, 0)
  assert.deepEqual(n, [])
  assert.deepEqual(passed, [])
})

test('los mensajes que WhatsApp no entrega a la API se explican, no dicen «[errors]»', () => {
  assert.equal(parseInbound({ type: 'errors', errors: [{ code: 131051 }] }).text, UNSUPPORTED_TEXT)
  assert.equal(parseInbound({ type: 'unsupported' }).text, UNSUPPORTED_TEXT)
  assert.equal(parseInbound({ type: 'otro_tipo' }).text, '[otro_tipo]')
})
