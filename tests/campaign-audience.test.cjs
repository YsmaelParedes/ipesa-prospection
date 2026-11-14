// Audiencia de campaña: a quién deja elegir la pantalla de Campañas y por qué
// no a los demás, con la misma regla que aplica la salida de WhatsApp.
const h = require('./whatsapp-outbox-harness.cjs')
const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { loadAudience } = require(h.resolveTs('lib/campaignAudience'))
const { FRIENDLY_ERRORS } = require(h.resolveTs('lib/whatsapp'))
const audienceRoute = h.loadRoute('app/api/whatsapp/campaigns/audience/route')
const campaigns = h.loadRoute('app/api/whatsapp/campaigns/send/route')

const ago = hours => new Date(Date.now() - hours * 3_600_000).toISOString()
function message(phone, over = {}) {
  h.db.tables.whatsapp_messages.push({
    id: `m-${Math.random()}`, store_id: h.STORE, phone, direction: 'outbound', template_name: 'promo', status: 'sent',
    error_message: null, error_code: null, created_at: ago(48), updated_at: ago(48), ...over,
  })
}
const noWhatsApp = { status: 'failed', error_code: 131026, error_message: FRIENDLY_ERRORS[131026] }

let people
beforeEach(() => {
  h.reset()
  people = {
    ana: h.addContact({ name: 'Ana', phone: '2220000001', segment: 'Pintor' }),
    beto: h.addContact({ name: 'Beto', phone: '2220000002', wa_opt_out: true }),
    carla: h.addContact({ name: 'Carla', phone: '2220000003', line_type: 'fijo' }),
    dani: h.addContact({ name: 'Dani', phone: '2220000004' }),
    eli: h.addContact({ name: 'Eli', phone: '2220000005' }),
    fer: h.addContact({ name: 'Fer', phone: '2220000006' }),
    ivan: h.addContact({ name: 'Iván', phone: '+52 222 000 0007' }),
  }
  h.addContact({ name: 'Sin teléfono', phone: null })
  h.addContact({ name: 'Corto', phone: '123' })
  message('2220000004', noWhatsApp)                                     // plantilla rechazada: no tiene WhatsApp
  message('2220000005', { ...noWhatsApp, template_name: null })         // solo texto rechazado
  message('2220000006', { status: 'failed', error_code: 131049, error_message: FRIENDLY_ERRORS[131049], updated_at: ago(2) })
  message('2220000007', { status: 'read' })
})

test('cada contacto con celular, con su historial, su bloqueo y la espera de Meta', async () => {
  const byName = Object.fromEntries((await loadAudience(h.STORE)).map(c => [c.name, c]))
  assert.deepEqual(Object.keys(byName).sort(), ['Ana', 'Beto', 'Carla', 'Dani', 'Eli', 'Fer', 'Iván'])
  assert.deepEqual(byName.Ana, { id: people.ana.id, name: 'Ana', phone: '2220000001', segment: 'Pintor', history: 'never', block: null, hold: false })
  assert.deepEqual([byName.Beto.history, byName.Beto.block], ['opt_out', 'opt_out'])
  assert.deepEqual([byName.Carla.history, byName.Carla.block], ['never', 'landline'])
  assert.deepEqual([byName.Dani.history, byName.Dani.block], ['no_whatsapp', 'no_whatsapp'])
  // Sin plantillas no tiene historial de campañas, pero el envío tampoco lo dejaría salir
  assert.deepEqual([byName.Eli.history, byName.Eli.block], ['never', 'no_whatsapp'])
  assert.deepEqual([byName.Fer.history, byName.Fer.block, byName.Fer.hold], ['meta_limit', null, true])
  assert.deepEqual([byName['Iván'].history, byName['Iván'].block, byName['Iván'].phone], ['read', null, '+52 222 000 0007'])
})

test('lo que la pantalla deja elegir es lo que después sale', async () => {
  const audience = await loadAudience(h.STORE)
  const res = await campaigns.POST(h.jsonRequest('/api/whatsapp/campaigns/send', {
    template: 'promo', bodyPreview: 'Hola {{1}}', personalize: true,
    recipients: audience.map(c => ({ contactId: c.id })),
  }))
  const { results } = await res.json()
  for (const c of audience) {
    const r = results.find(x => x.contactId === c.id)
    const eligible = !c.block && !c.hold   // plantilla de marketing: la espera de Meta aplica
    assert.equal(r.ok, eligible, `${c.name}: ${r.error ?? 'enviado'}`)
  }
})

test('la ruta solo es para administradores con Campañas', async () => {
  const res = await audienceRoute.GET()
  assert.equal(res.status, 200)
  assert.equal((await res.json()).contacts.length, 7)
  h.session.ctx = h.ctxFor({ modules: { whatsapp: true, campaigns: false } })
  assert.equal((await audienceRoute.GET()).status, 403)
})
