require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { cleanMessage, cleanContext, fingerprintOf, isIgnorableError, MAX_MESSAGE } = require('../lib/errorFingerprint.ts')

test('the message never keeps emails, phones, ids or keys', () => {
  const msg = cleanMessage(new Error(
    'Fallo con ana.lopez@correo.com, tel 2221886717, contacto 3940d7e6-9807-43fa-9f19-f0a2efd743ce y token eyJhbGciOiJIUzI1NiJ9abc123DEF456ghi789JKL012',
  ))
  assert.doesNotMatch(msg, /ana\.lopez@correo\.com/)
  assert.doesNotMatch(msg, /2221886717/)
  assert.doesNotMatch(msg, /3940d7e6-9807/)
  assert.doesNotMatch(msg, /eyJhbGciOiJIUzI1NiJ9/)
  assert.match(msg, /<correo>/)
  assert.match(msg, /<número>/)
  assert.match(msg, /<id>/)
  assert.match(msg, /<llave>/)
})

test('constraint names and short numbers stay readable', () => {
  const msg = cleanMessage('duplicate key value violates unique constraint "contacts_store_phone_key" (code 23505)')
  assert.match(msg, /contacts_store_phone_key/)
  assert.match(msg, /23505/)
})

test('the message is trimmed and never empty', () => {
  assert.equal(cleanMessage('x'.repeat(1000)).length, MAX_MESSAGE)
  assert.equal(cleanMessage(''), 'Error sin mensaje')
  assert.equal(cleanMessage(null), 'Error sin mensaje')
  assert.equal(cleanMessage({ message: '  dos   espacios  ' }), 'dos espacios')
})

test('the same failure with another id, number or email has the same fingerprint', () => {
  const a = fingerprintOf('server', 'GET /api/leads/3940d7e6-9807-43fa-9f19-f0a2efd743ce', 'Lead 15 no encontrado para ana@x.com')
  const b = fingerprintOf('server', 'GET /api/leads/11111111-2222-3333-4444-555555555555', 'Lead 987 no encontrado para pepe@y.mx')
  assert.equal(a, b)
  assert.match(a, /^[0-9a-f]{40}$/)
})

test('different source, route or message give different fingerprints', () => {
  const base = fingerprintOf('server', 'GET /api/leads', 'timeout')
  assert.notEqual(base, fingerprintOf('client', 'GET /api/leads', 'timeout'))
  assert.notEqual(base, fingerprintOf('server', 'GET /api/contacts', 'timeout'))
  assert.notEqual(base, fingerprintOf('server', 'GET /api/leads', 'permission denied'))
})

test('context keeps the route but drops ids', () => {
  assert.equal(cleanContext('PATCH /api/data/leads/3940d7e6-9807-43fa-9f19-f0a2efd743ce'), 'PATCH /api/data/leads/<id>')
  assert.equal(cleanContext(''), 'sin contexto')
})

test('cancellations and Next.js redirects are not failures', () => {
  assert.equal(isIgnorableError(Object.assign(new Error('x'), { name: 'AbortError' })), true)
  assert.equal(isIgnorableError(Object.assign(new Error('x'), { digest: 'NEXT_REDIRECT;replace;/login;307;' })), true)
  assert.equal(isIgnorableError(Object.assign(new Error('x'), { digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })), true)
  assert.equal(isIgnorableError(new Error('The operation was aborted')), true)
  assert.equal(isIgnorableError(new Error('relation "leads" does not exist')), false)
  assert.equal(isIgnorableError(null), false)
})
