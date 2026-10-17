require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const original = Module._load
let credentials = null, failure = false
Module._load = function (id, ...args) {
  if (id === './storeWhatsApp') return { getStoreWhatsAppCreds: async () => { if (failure) throw new Error('database unavailable'); return credentials } }
  if (id === './whatsappQuota') return { getMessagingLimit: async () => ({ limit: 250 }), uniqueRecipientsOutsideWindow24h: async () => 12 }
  return original.call(this, id, ...args)
}
const { getDashboardWhatsAppUsage } = require('../lib/dashboardWhatsApp.ts')
Module._load = original

test('an unconnected store has unknown usage, not an outage or a zero balance', async () => {
  credentials = null; failure = false
  assert.deepEqual(await getDashboardWhatsAppUsage('test'), { used: null, limit: null })
})
test('a connected store returns measured usage', async () => {
  credentials = {}; failure = false
  assert.deepEqual(await getDashboardWhatsAppUsage('test'), { used: 12, limit: 250 })
})
test('a failed lookup remains an error result', async () => {
  failure = true
  assert.equal(await getDashboardWhatsAppUsage('test'), null)
})
