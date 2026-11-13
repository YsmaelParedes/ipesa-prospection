// Salida de WhatsApp: lo que ve quien llama a las rutas de envío (plantilla,
// campaña, prueba, texto y archivo). Base en memoria y Meta simulado: ver
// whatsapp-outbox-harness.cjs.
const h = require('./whatsapp-outbox-harness.cjs')
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const campaigns = h.loadRoute('app/api/whatsapp/campaigns/send/route')
const testSend = h.loadRoute('app/api/whatsapp/test-send/route')
const conversation = h.loadRoute('app/api/whatsapp/conversations/[phone]/route')
const media = h.loadRoute('app/api/whatsapp/conversations/[phone]/media/route')

const CAMPAIGN = '33333333-3333-4333-8333-333333333333'
const base = { template: 'promo_buen_fin', language: 'es_MX', bodyPreview: 'Hola {{1}}, hay descuento', personalize: true }
const params = phone => ({ params: Promise.resolve({ phone }) })
const send = async body => { const res = await campaigns.POST(h.jsonRequest('/api/whatsapp/campaigns/send', body)); return { status: res.status, body: await res.json() } }
/** Refresca el límite de Meta guardado en memoria (el GET pide el dato fresco). */
const refreshLimit = () => campaigns.GET(h.jsonRequest('/api/whatsapp/campaigns/send', {}))
const messages = () => h.db.tables.whatsapp_messages

beforeEach(() => h.reset())

// ── Campaña ─────────────────────────────────────────────────────────────────
test('campaña: envía, salta bajas y fijos, y deja todo en el historial con su envío', async () => {
  await refreshLimit()
  const ana = h.addContact({ name: 'Ana López', phone: '2221112233' })
  const baja = h.addContact({ name: 'Beto', phone: '2221112244', wa_opt_out: true })
  const fijo = h.addContact({ name: 'Carla', phone: '2221112255', line_type: 'fijo' })

  const { status, body } = await send({ ...base, recipients: [ana, baja, fijo].map(c => ({ contactId: c.id })), campaignId: CAMPAIGN, campaignLabel: ' Pintor ' })
  assert.equal(status, 200)
  assert.equal(body.stop, undefined)
  const by = id => body.results.find(r => r.contactId === id)
  assert.deepEqual(by(ana.id), { contactId: ana.id, ok: true, messageId: 'wamid.1', held: false })
  assert.deepEqual(by(baja.id), { contactId: baja.id, ok: false, skipped: true, error: 'Pidió no recibir campañas (dado de baja)' })
  assert.deepEqual(by(fijo.id), { contactId: fijo.id, ok: false, skipped: true, noWhatsApp: true, error: 'Sin WhatsApp: está marcado como teléfono fijo.' })

  assert.equal(h.meta.sent.length, 1)
  const [payload] = h.meta.sent
  assert.equal(payload.to, '522221112233')
  assert.deepEqual(payload.template.components, [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }])

  assert.equal(messages().length, 1)
  const [row] = messages()
  assert.equal(row.status, 'sent')
  assert.equal(row.wa_message_id, 'wamid.1')
  assert.equal(row.campaign_id, CAMPAIGN)
  assert.equal(row.campaign_label, 'Pintor')
  assert.equal(row.body, 'Hola Ana, hay descuento')
  assert.equal(row.contact_id, ana.id)
})

test('campaña: a quien Meta reportó sin WhatsApp no se le envía', async () => {
  const ana = h.addContact({ phone: '2221112233' })
  messages().push({ id: 'old', store_id: h.STORE, phone: '2221112233', direction: 'outbound', template_name: 'x', status: 'failed', error_message: 'El mensaje no se pudo entregar (el número no tiene WhatsApp o no aceptó los términos recientes).', error_code: 131026, created_at: new Date().toISOString() })
  const { body } = await send({ ...base, recipients: [{ contactId: ana.id }] })
  assert.equal(body.results[0].noWhatsApp, true)
  assert.match(body.results[0].error, /^Sin WhatsApp: Meta rechazó el último envío/)
  assert.equal(h.meta.sent.length, 0)
})

test('campaña: un 131050 de Meta da de baja al contacto', async () => {
  const ana = h.addContact({ phone: '2221112233' })
  h.meta.failFor.set('522221112233', 131050)
  const { body } = await send({ ...base, recipients: [{ contactId: ana.id }] })
  assert.equal(body.results[0].ok, false)
  assert.equal(body.results[0].code, 131050)
  assert.equal(h.db.tables.contacts[0].wa_opt_out, true)
  assert.equal(messages()[0].status, 'failed')
  assert.equal(messages()[0].error_code, 131050)
})

test('campaña: un error que afecta a todo el número detiene el envío y se reporta', async () => {
  const ana = h.addContact({ phone: '2221112233' })
  h.meta.failFor.set('522221112233', 131048)
  const { body } = await send({ ...base, recipients: [{ contactId: ana.id }] })
  assert.match(body.stop, /^Envío detenido: Meta restringió/)
  assert.equal(h.reported.length, 1)
})

test('campaña: con el número bloqueado por Meta no sale nada', async () => {
  h.meta.health.canSend = 'BLOCKED'
  await refreshLimit()
  const ana = h.addContact()
  const { status, body } = await send({ ...base, recipients: [{ contactId: ana.id }] })
  assert.equal(status, 200)
  assert.deepEqual(body.results, [])
  assert.match(body.stop, /bloqueado/)
  assert.equal(h.meta.sent.length, 0)
})

test('campaña: al llegar al límite de Meta se detiene', async () => {
  h.meta.health.tier = 'TIER_50'
  await refreshLimit()
  for (let i = 0; i < 50; i++) messages().push({ id: `m${i}`, store_id: h.STORE, phone: `55000000${String(i).padStart(2, '0')}`, direction: 'outbound', template_name: 'x', status: 'sent', created_at: new Date().toISOString() })
  const ana = h.addContact()
  const { body } = await send({ ...base, recipients: [{ contactId: ana.id }] })
  assert.match(body.stop, /límite de Meta de 50 personas/)
  assert.equal(h.meta.sent.length, 0)
})

test('campaña: sin el extra de Campañas, o con lote inválido, se rechaza', async () => {
  const ana = h.addContact()
  h.session.ctx = h.ctxFor({ modules: { whatsapp: true, campaigns: false } })
  assert.equal((await send({ ...base, recipients: [{ contactId: ana.id }] })).status, 403)
  h.session.ctx = h.ctxFor()
  assert.equal((await send({ ...base, recipients: [] })).status, 400)
  assert.equal((await send({ ...base, personalize: false, recipients: [{ contactId: ana.id }] })).body.error, 'Falta el valor de la variable {{1}} de la plantilla')
})

// ── Plantilla a una persona (desde el chat) ─────────────────────────────────
test('chat: plantilla a un contacto', async () => {
  const ana = h.addContact()
  const { status, body } = await send({ ...base, contactId: ana.id })
  assert.equal(status, 200)
  assert.deepEqual(body, { ok: true, messageId: 'wamid.1', held: false })
  assert.equal(messages()[0].campaign_id, undefined)
})

test('chat: contacto inexistente y número inválido', async () => {
  const missing = await send({ ...base, contactId: '44444444-4444-4444-8444-444444444444' })
  assert.deepEqual([missing.status, missing.body.error], [404, 'Contacto no encontrado'])
  const bad = await send({ ...base, phone: '123' })
  assert.deepEqual([bad.status, bad.body.error], [400, 'Número inválido'])
})

test('chat: a un número sin WhatsApp solo se le envía si se insiste', async () => {
  messages().push({ id: 'old', store_id: h.STORE, phone: '2229998877', direction: 'outbound', template_name: 'x', status: 'failed', error_code: 131026, error_message: 'El mensaje no se pudo entregar (el número no tiene WhatsApp o no aceptó los términos recientes).', created_at: new Date().toISOString() })
  const first = await send({ ...base, personalize: false, bodyParams: ['hola'], phone: '2229998877' })
  assert.equal(first.body.noWhatsApp, true)
  assert.equal(h.meta.sent.length, 0)
  const forced = await send({ ...base, personalize: false, bodyParams: ['hola'], phone: '2229998877', force: true })
  assert.equal(forced.body.ok, true)
  assert.equal(h.meta.sent.length, 1)
})

test('chat: límite de Meta responde 429', async () => {
  h.meta.health.tier = 'TIER_50'
  await refreshLimit()
  for (let i = 0; i < 50; i++) messages().push({ id: `m${i}`, store_id: h.STORE, phone: `55000000${String(i).padStart(2, '0')}`, direction: 'outbound', template_name: 'x', status: 'sent', created_at: new Date().toISOString() })
  const ana = h.addContact()
  const { status, body } = await send({ ...base, contactId: ana.id })
  assert.equal(status, 429)
  assert.equal(body.ok, false)
})

test('sin WhatsApp conectado: 409', async () => {
  h.reset({ connected: false })
  const ana = h.addContact()
  const { status, body } = await send({ ...base, contactId: ana.id })
  assert.equal(status, 409)
  assert.match(body.error, /aún no está conectado/)
})

// ── Prueba de plantilla ─────────────────────────────────────────────────────
test('prueba: envía, respeta bajas y devuelve el error de Meta', async () => {
  const post = async body => { const res = await testSend.POST(h.jsonRequest('/api/whatsapp/test-send', body)); return { status: res.status, body: await res.json() } }
  const ok = await post({ to: '522221112233', template: 'hello_world', bodyParam: 'Ana' })
  assert.deepEqual(ok, { status: 200, body: { success: true, messageId: 'wamid.1' } })
  assert.equal(h.meta.sent[0].to, '522221112233')
  assert.equal(messages()[0].body, '[Plantilla de prueba: hello_world]')
  assert.equal(messages()[0].status, 'sent')

  h.addContact({ phone: '2221112244', wa_opt_out: true })
  const optedOut = await post({ to: '522221112244', template: 'hello_world' })
  assert.equal(optedOut.status, 409)

  h.meta.failFor.set('522223334455', 132001)
  const failed = await post({ to: '522223334455', template: 'hello_world' })
  assert.equal(failed.status, 502)
  assert.equal(failed.body.error, 'La plantilla no existe o no está aprobada en ese idioma.')
})

// ── Texto y archivos (dentro de la conversación) ────────────────────────────
test('texto: sale por Meta y queda en el historial con el contacto', async () => {
  const ana = h.addContact({ phone: '2221112233' })
  const res = await conversation.POST(h.jsonRequest('/api/whatsapp/conversations/2221112233', { body: ' Hola ' }), params('2221112233'))
  assert.equal(res.status, 200)
  const { message } = await res.json()
  assert.equal(message.body, 'Hola')
  assert.equal(message.contact_id, ana.id)
  assert.equal(message.direction, 'outbound')
  assert.equal(message.user_id, h.UID)
  assert.equal(h.meta.sent[0].to, '522221112233')
  assert.deepEqual(h.meta.sent[0].text, { body: 'Hola', preview_url: true })
  assert.equal(messages()[0].wa_message_id, 'wamid.1')
})

test('texto: si Meta lo rechaza no queda en el historial', async () => {
  h.meta.failFor.set('522221112233', 131047)
  const res = await conversation.POST(h.jsonRequest('/api/whatsapp/conversations/2221112233', { body: 'Hola' }), params('2221112233'))
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 131047)
  assert.equal(messages().length, 0)
})

test('texto: sin WhatsApp conectado 409, y validaciones', async () => {
  const empty = await conversation.POST(h.jsonRequest('/x', { body: '  ' }), params('2221112233'))
  assert.equal(empty.status, 400)
  h.reset({ connected: false })
  const res = await conversation.POST(h.jsonRequest('/x', { body: 'Hola' }), params('2221112233'))
  assert.equal(res.status, 409)
})

test('archivo: se sube, se envía y queda con su etiqueta', async () => {
  const { NextRequest } = require('next/server')
  const form = new FormData()
  form.append('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'cotización.pdf', { type: 'application/pdf' }))
  const res = await media.POST(new NextRequest('http://localhost/x', { method: 'POST', body: form }), params('2221112233'))
  assert.equal(res.status, 200)
  const { message } = await res.json()
  assert.equal(message.media_id, 'media-1')
  assert.equal(message.media_type, 'document')
  assert.match(message.body, /Documento · cotización\.pdf$/)
  assert.equal(h.meta.sent[0].document.id, 'media-1')
  assert.equal(h.meta.sent[0].document.filename, 'cotización.pdf')

  h.meta.uploadFails = true
  const form2 = new FormData()
  form2.append('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'a.pdf', { type: 'application/pdf' }))
  const failed = await media.POST(new NextRequest('http://localhost/x', { method: 'POST', body: form2 }), params('2221112233'))
  assert.equal(failed.status, 502)
  assert.equal(messages().length, 1)
})
