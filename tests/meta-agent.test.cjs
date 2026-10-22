require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { toSettings, settingsPayload, agentError, toE164 } = require('../lib/metaAgent.ts')

test('lee los ajustes de WhatsApp de la lista que regresa Meta', () => {
  const s = toSettings([
    { agent_id: 'ig1', channel: 'instagram', rollout: { enabled: false } },
    {
      agent_id: 'wa1', channel: 'whatsapp', rollout: { enabled: true }, ai_audience: 'ALLOWLISTED_ONLY',
      handoff: { enabled: true, message_selection: 'CUSTOM', message: 'Ya te atienden' },
      followup: { enabled: true, followup_interval_in_seconds: 900, message: '¿Sigues ahí?' },
    },
  ])
  assert.equal(s.agentId, 'wa1')
  assert.equal(s.enabled, true)
  assert.equal(s.audience, 'ALLOWLISTED_ONLY')
  assert.deepEqual(s.handoff, { enabled: true, selection: 'CUSTOM', message: 'Ya te atienden' })
  assert.deepEqual(s.followup, { enabled: true, interval: 900, message: '¿Sigues ahí?' })
  assert.equal(s.neverSay, null)
})

test('sin configurar: público "todos" (lo que hace Meta) y sin agente si la lista viene vacía', () => {
  const s = toSettings([{ agent_id: 'a', channel: 'whatsapp', rollout: { enabled: false }, handoff: null, followup: null }])
  assert.equal(s.audience, 'EVERYONE')
  assert.equal(s.handoff.enabled, false)
  assert.equal(s.followup.enabled, false)
  assert.equal(toSettings([]), null)
})

test('solo manda lo que cambió', () => {
  assert.deepEqual(settingsPayload({ enabled: false }), { rollout: { enabled: false } })
  assert.deepEqual(settingsPayload({ audience: 'EVERYONE' }), { ai_audience: 'EVERYONE' })
})

test('mensaje propio al pasar el chat y recordatorio', () => {
  assert.deepEqual(
    settingsPayload({ handoff: { enabled: true, selection: 'CUSTOM', message: '  Un momento  ' } }),
    { handoff: { enabled: true, message_selection: 'CUSTOM', message: 'Un momento' } },
  )
  assert.deepEqual(
    settingsPayload({ handoff: { enabled: true, selection: 'DEFAULT', message: 'se ignora' } }),
    { handoff: { enabled: true, message_selection: 'DEFAULT' } },
  )
  assert.deepEqual(
    settingsPayload({ followup: { enabled: true, interval: 3600, message: 'Hola' } }),
    { followup: { enabled: true, followup_interval_in_seconds: 3600, message: 'Hola' } },
  )
  assert.deepEqual(
    settingsPayload({ followup: { enabled: false, interval: 3600, message: '' } }),
    { followup: { enabled: false, followup_interval_in_seconds: 0 } },
  )
})

test('rechaza lo que Meta no acepta', () => {
  assert.match(settingsPayload({ audience: 'ALGUNOS' }), /Público/)
  assert.match(settingsPayload({ handoff: { enabled: true, selection: 'CUSTOM', message: ' ' } }), /mensaje/)
  assert.match(settingsPayload({ followup: { enabled: true, interval: 60, message: 'x' } }), /Tiempo/)
  assert.match(settingsPayload({ followup: { enabled: true, interval: 300, message: '' } }), /recordatorio/)
  assert.match(settingsPayload({ neverSay: ['x'.repeat(201)] }), /200/)
  assert.equal(settingsPayload({}), 'No hay cambios')
})

test('las frases prohibidas se limpian y no se repiten', () => {
  assert.deepEqual(settingsPayload({ neverSay: [' gratis ', 'gratis', ''] }), { never_say_phrases: ['gratis'] })
  assert.deepEqual(settingsPayload({ neverSay: [] }), { never_say_phrases: [] })
})

test('errores legibles y número en E.164', () => {
  assert.equal(agentError(400, { title: 'Bad Request', detail: 'Allowlist is full (max 20)' }), 'Allowlist is full (max 20)')
  assert.match(agentError(401, {}), /permiso/)
  assert.match(agentError(429, {}), /Espera/)
  assert.equal(toE164('2224105762'), '+522224105762')
})
