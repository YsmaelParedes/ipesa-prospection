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

const { processChange, parseAgentEcho } = require('../lib/whatsappWebhook.ts')

const STORE = 'store-1'
const meta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '5212220000000', phone_number_id: '123' } }

test('el bloque standby guarda al cliente, la respuesta del agente y sus palomitas', async () => {
  inserted.length = 0; updated.length = 0
  const notifications = await processChange(STORE, {
    ...meta,
    standby: {
      contacts: [{ profile: { name: 'Ana' }, wa_id: '5212221112233' }],
      messages: [{ from: '5212221112233', id: 'wamid.IN', timestamp: '1792700000', type: 'text', text: { body: '¿Tienen esmalte?' } }],
      message_echoes: [{
        id: 'wamid.AGENT', timestamp: '1792700005',
        message: { messaging_product: 'whatsapp', to: '5212221112233', recipient_type: 'individual', type: 'text', text: { body: 'Sí, ¿de qué color?' } },
      }],
      statuses: [{ id: 'wamid.AGENT', status: 'delivered', timestamp: '1792700006', recipient_id: '5212221112233' }],
    },
  })

  const cliente = inserted.find(r => r.wa_message_id === 'wamid.IN')
  assert.equal(cliente.direction, 'inbound')
  assert.equal(cliente.body, '¿Tienen esmalte?')
  assert.equal(cliente.profile_name, 'Ana')

  const agente = inserted.find(r => r.wa_message_id === 'wamid.AGENT')
  assert.equal(agente.direction, 'outbound')
  assert.equal(agente.body, 'Sí, ¿de qué color?')
  assert.equal(agente.user_id, null)
  assert.equal(agente.template_name, null)
  assert.equal(agente.status, 'sent')
  assert.equal(agente.phone, cliente.phone)

  assert.ok(updated.some(u => u.status === 'delivered'))
  // Lo atiende el agente: no se avisa al equipo
  assert.deepEqual(notifications, [])
})

test('un mensaje normal sigue avisando al equipo', async () => {
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

test('las respuestas interactivas y plantillas del agente se leen como texto', () => {
  assert.equal(parseAgentEcho({
    type: 'interactive',
    interactive: { type: 'button', body: { text: '¿Qué necesitas?' }, action: { buttons: [{ reply: { title: 'Cotizar' } }, { reply: { title: 'Horario' } }] } },
  }).text, '¿Qué necesitas?\n👉 Cotizar · Horario')
  assert.equal(parseAgentEcho({ type: 'template', template: { name: 'bienvenida_tienda' } }).text, '📋 Plantilla · bienvenida tienda')
  const img = parseAgentEcho({ type: 'image', image: { id: 'MEDIA1', caption: 'Catálogo' } })
  assert.equal(img.mediaId, 'MEDIA1')
  assert.equal(img.optOutCandidate, undefined)
})

test('una copia sin destinatario no se guarda', async () => {
  inserted.length = 0
  await processChange(STORE, { ...meta, standby: { message_echoes: [{ id: 'wamid.X', message: { type: 'text', text: { body: 'x' } } }] } })
  assert.equal(inserted.length, 0)
})
