require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { measure, withServerTiming } = require('../lib/serverTiming.ts')

test('timings remain isolated between concurrent requests and force private no-store', async () => {
  const first = withServerTiming(async () => {
    await measure('auth', async () => new Promise(r => setTimeout(r, 5)))
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'private, max-age=600' } })
  })
  const second = withServerTiming(async () => {
    await measure('external', async () => new Promise(r => setTimeout(r, 2)))
    return Response.json({ ok: true })
  })
  const [a, b] = await Promise.all([first(), second()])
  assert.match(a.headers.get('Server-Timing'), /auth;dur=[\d.]+/)
  assert.doesNotMatch(a.headers.get('Server-Timing'), /external/)
  assert.match(b.headers.get('Server-Timing'), /external;dur=[\d.]+/)
  assert.doesNotMatch(b.headers.get('Server-Timing'), /auth/)
  assert.match(a.headers.get('Server-Timing'), /total;dur=[\d.]+/)
  assert.equal(a.headers.get('Cache-Control'), 'private, no-store')
})

test('denied requests also receive timing and private-cache headers', async () => {
  const handler = withServerTiming(async () => new Response(null, { status: 401 }))
  const response = await handler()
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.match(response.headers.get('Server-Timing'), /total;dur=/)
})
