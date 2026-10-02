// ── IPESA CRM — Service Worker ────────────────────────────────────────────
// Versión: v5 — actualizar al hacer cambios importantes
// Estrategia: cache mínimo (solo recursos PWA esenciales + página offline).
// Next.js ya versiona sus bundles JS/CSS con content-hash en los URLs,
// así que no es necesario cachearlos aquí — hacerlo solo acumula basura.
const CACHE_NAME = 'ipesa-v5'

const PRECACHE = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · IPESA CRM</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#F4EFE4;color:#1A1410;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{color:#80766B;margin:0 0 18px}button{background:#EE5A24;color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:600;font-size:14px}</style></head>
<body><div><h1>Sin conexión</h1><p>Revisa tu internet e intenta de nuevo.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`

// ── Install: pre-cachear solo recursos PWA ───────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))  // no fallar si un ícono no existe
      .then(() => self.skipWaiting())
  )
})

// ── Activate: eliminar caches viejos, tomar control ─────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ── Fetch ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return

  // API: siempre red — nunca cachear datos en tiempo real
  if (url.pathname.startsWith('/api/')) return

  // Navegación: red primero; sin red, una página offline en vez del error del navegador
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    )
    return
  }

  // Recursos PWA (iconos, manifest): cache-first — son estables
  if (PRECACHE.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)))
  }
  // Todo lo demás (JS, CSS, fuentes, imágenes): caché HTTP nativo del navegador
})

// ── Push: mostrar notificación nativa ────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return

  let payload = { title: 'IPESA CRM', body: 'Tienes un aviso pendiente', url: '/recordatorios', tag: '' }
  try { payload = { ...payload, ...e.data.json() } } catch {}

  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body:     payload.body,
      icon:     '/icon-192.png',
      badge:    '/icon-192.png',
      // Etiqueta por recordatorio/conversación: antes todas compartían la misma
      // y cada aviso nuevo reemplazaba al anterior.
      tag:      payload.tag || `ipesa-${Date.now()}`,
      renotify: !!payload.tag,
      requireInteraction: payload.url === '/recordatorios',
      vibrate:  [200, 100, 200],
      data:     { url: payload.url },
      actions:  [
        { action: 'open',  title: payload.url.startsWith('/whatsapp') ? 'Abrir chat' : 'Ver recordatorio' },
        { action: 'close', title: 'Cerrar' },
      ],
    })
  )
})

// ── Notification click: abrir la app en la página correcta ───────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()
  if (e.action === 'close') return

  const url = e.notification.data?.url || '/recordatorios'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(c => ('navigate' in c ? c.navigate(url) : c))
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
