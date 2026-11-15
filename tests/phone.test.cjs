require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { waChatPhone, isForeignPhone, toWhatsAppNumber, phoneVariants, fmtPhone, normalizePhone } = require('../lib/phone.ts')

test('waChatPhone: México a 10 dígitos, otro país completo', () => {
  assert.equal(waChatPhone('5212224445566'), '2224445566')
  assert.equal(waChatPhone('522224445566'), '2224445566')
  assert.equal(waChatPhone('2224445566'), '2224445566')
  // EE. UU. y España: antes se recortaban a 10 y parecían números de México
  assert.equal(waChatPhone('15551234567'), '15551234567')
  assert.equal(waChatPhone('+34 612 345 678'), '34612345678')
  assert.equal(waChatPhone('123'), '')
  assert.equal(waChatPhone(null), '')
})

test('contestar a un número de otro país no lo manda a México', () => {
  assert.equal(toWhatsAppNumber('15551234567'), '15551234567')
  assert.equal(toWhatsAppNumber('34612345678'), '34612345678')
  // Los de México siguen igual
  assert.equal(toWhatsAppNumber('2224445566'), '522224445566')
  assert.equal(toWhatsAppNumber('5212224445566'), '522224445566')
})

test('un número de otro país nunca es el mismo que un contacto de México', () => {
  assert.deepEqual(phoneVariants('15551234567'), ['15551234567'])
  assert.deepEqual(phoneVariants('2224445566'), ['2224445566', '522224445566', '5212224445566'])
  assert.equal(isForeignPhone('15551234567'), true)
  assert.equal(isForeignPhone('2224445566'), false)
  assert.equal(isForeignPhone('522224445566'), false)
})

test('se muestra con su lada', () => {
  assert.equal(fmtPhone('15551234567'), '+15551234567')
  assert.equal(fmtPhone('2224445566'), '222 444 5566')
})

test('normalizePhone (Contactos, importar) no cambia', () => {
  assert.equal(normalizePhone('0442224445566'), '2224445566')
  assert.equal(normalizePhone('+52 1 222 444 5566'), '2224445566')
})
