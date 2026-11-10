require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const p = require('../lib/whatsappSignupParse.ts')

const finish = (event, data) => JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data })

test('lee la cuenta y el número al terminar en Meta', () => {
  assert.deepEqual(p.readSessionInfo(finish('FINISH', { waba_id: '980198427658004', phone_number_id: '106540352242922', business_id: '2329417887457253' })), {
    wabaId: '980198427658004', phoneNumberId: '106540352242922', businessId: '2329417887457253', coexistence: false,
  })
})

test('coexistencia: número de WhatsApp Business (solo trae la cuenta)', () => {
  const info = p.readSessionInfo(finish('FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', { waba_id: '980198427658004' }))
  assert.equal(info.coexistence, true)
  assert.equal(info.phoneNumberId, null)
})

test('versión 5: la cuenta llega en messaging_account_ids', () => {
  const info = p.readSessionInfo(finish('FINISH', { messaging_account_ids: ['980198427658004'], phone_number_id: '106540352242922', is_on_biz_app: true }))
  assert.equal(info.wabaId, '980198427658004')
  assert.equal(info.coexistence, true)
})

test('cancelar, errores y avisos ajenos', () => {
  assert.equal(p.readSessionInfo(finish('CANCEL', { current_step: 'PHONE_NUMBER_SETUP' })), 'cancel')
  assert.equal(p.readSessionInfo(finish('ERROR', { error_message: 'x' })), 'cancel')
  assert.equal(p.readSessionInfo('no es json'), null)
  assert.equal(p.readSessionInfo(JSON.stringify({ type: 'OTRO', event: 'FINISH' })), null)
  // Ids que no son números largos no se aceptan
  assert.equal(p.readSessionInfo(finish('FINISH', { waba_id: '../x' })), null)
  assert.equal(p.readSessionInfo(finish('FINISH', { waba_id: '980198427658004', phone_number_id: 'abc' })).phoneNumberId, null)
})

test('el servidor solo acepta ids numéricos y un código sin espacios', () => {
  assert.equal(p.parseSignupInput(null), null)
  assert.equal(p.parseSignupInput({ code: 'abc' }), null)
  assert.deepEqual(p.parseSignupInput({ code: 'AQB-x_1', wabaId: '980198427658004', phoneNumberId: '106540352242922', coexistence: true }), {
    code: 'AQB-x_1', wabaId: '980198427658004', phoneNumberId: '106540352242922', businessId: null, coexistence: true,
  })
  // Sin código = retomar un alta a medias
  assert.equal(p.parseSignupInput({ wabaId: '980198427658004' }).code, null)
  assert.equal(p.parseSignupInput({ code: 'a b', wabaId: '980198427658004' }).code, null)
  assert.equal(p.parseSignupInput({ code: 'x', wabaId: '980198427658004', coexistence: 'true' }).coexistence, false)
})
