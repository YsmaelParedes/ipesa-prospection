// Local-only measurement helper: allows the preview debugger to evaluate browser
// timings against production builds. Never deploy this proxy. No API caching.
import http from 'node:http'
import { Transform } from 'node:stream'
const port = Number(process.argv[2] || 3300)
const target = Number(process.argv[3] || 3100)
const mobile = process.argv.includes('--mobile')
let nextByteAt = 0
if (![port, target].every(n => Number.isInteger(n) && n >= 1024 && n <= 65535)) throw new Error('Invalid local port')
http.createServer((req, res) => {
  const upstream = http.request({ hostname: '127.0.0.1', port: target, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${target}` } }, incoming => {
    const headers = { ...incoming.headers }
    // Deska's evaluator uses eval; the application's production CSP remains intact.
    delete headers['content-security-policy']
    const send = () => {
      res.writeHead(incoming.statusCode || 502, headers)
      if (!mobile) return incoming.pipe(res)
      // Shared downstream 1.6 Mbps budget, plus 150 ms latency per response.
      incoming.pipe(new Transform({ transform(chunk, encoding, done) {
        const now = Date.now()
        nextByteAt = Math.max(now, nextByteAt) + chunk.length / 200
        setTimeout(() => done(null, chunk), nextByteAt - now)
      } })).pipe(res)
    }
    if (mobile) setTimeout(send, 150); else send()
  })
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local benchmark target unavailable') })
  req.pipe(upstream)
}).listen(port, '127.0.0.1', () => console.log(`Benchmark proxy localhost:${port} -> localhost:${target}${mobile ? ' (150ms, 1.6Mbps downstream)' : ''}`))
