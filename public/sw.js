// ── CRM Pinturas — Service Worker ─────────────────────────────────────────
// Versión: v8 — actualizar al hacer cambios importantes (v8: avisos más confiables)
// Estrategia: cache mínimo (solo recursos PWA esenciales + página offline).
// Next.js ya versiona sus bundles JS/CSS con content-hash en los URLs,
// así que no es necesario cachearlos aquí — hacerlo solo acumula basura.
const CACHE_NAME = 'crm-v8'

const PRECACHE = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/badge-96.png']

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · CRM Pinturas</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#F4F4F5;color:#131313;text-align:center;padding:24px}
body:before{content:"";position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#E2E415,#4EC39C,#00BBD9,#E51585,#FD0B2B)}
h1{font-size:20px;margin:0 0 8px}p{color:#6B6B6A;margin:0 0 18px}button{background:#E50A26;color:#fff;border:0;border-radius:10px;padding:11px 18px;font-weight:700;font-size:14px}</style></head>
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
// Siempre se muestra algo: iPhone da de baja los avisos de un sitio que
// recibe pushes sin mostrarlos.
self.addEventListener('push', e => {
  let p = { title: 'CRM Pinturas', body: 'Tienes un aviso pendiente', url: '/recordatorios', tag: '' }
  try { if (e.data) p = { ...p, ...e.data.json() } } catch {}
  const chat = p.url.startsWith('/whatsapp')

  e.waitUntil(
    self.registration.showNotification(p.title, {
      body:  p.body,
      icon:  '/icon-192.png',
      badge: '/badge-96.png',  // silueta de la gota en la barra de Android
      // Una etiqueta por recordatorio/conversación: el aviso nuevo reemplaza
      // al anterior del mismo tema en vez de apilarse.
      tag:   p.tag || `crm-${Date.now()}`,
      // Un chat vuelve a sonar con cada mensaje; un recordatorio repetido no
      renotify: !!p.tag && (p.renotify ?? chat),
      requireInteraction: !!p.sticky,
      vibrate:   [200, 100, 200],
      timestamp: Date.now(),
      data:      { url: p.url },
      actions: [
        { action: 'open',  title: chat ? 'Abrir chat' : 'Ver agenda' },
        { action: 'close', title: 'Cerrar' },
      ],
    })
  )
})

// ── Notification click: abrir la app en la pantalla del aviso ────────────
self.addEventListener('notificationclick', e => {
  e.notification.close()
  if (e.action === 'close') return

  const target = new URL(e.notification.data?.url || '/recordatorios', self.location.origin).href
  e.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Ya está abierta justo ahí: solo traerla al frente
    const same = windows.find(w => w.url === target)
    if (same) return same.focus()
    // Abierta en otra pantalla: traerla al frente y llevarla al aviso
    for (const w of windows) {
      try {
        const win = await w.focus()
        return await (win || w).navigate(target)
      } catch {}  // una pestaña que este service worker no controla no se puede mover
    }
    return self.clients.openWindow(target)
  })())
})

// ── El navegador renovó la suscripción: registrar la nueva ───────────────
// Sin esto, los avisos dejaban de llegar en silencio hasta volver a abrir la app.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const old = e.oldSubscription
    const key = old && old.options && old.options.applicationServerKey
    const sub = e.newSubscription
      || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null)
    if (!sub) return  // al abrir la app, la campana pedirá activarlos de nuevo
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...sub.toJSON(), oldEndpoint: old ? old.endpoint : undefined }),
    })
  })().catch(() => {}))
})
