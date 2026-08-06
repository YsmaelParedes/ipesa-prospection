// ── IPESA CRM — Service Worker ────────────────────────────────────────────
// Versión: v4 — actualizar al hacer cambios importantes
// Estrategia: cache mínimo (solo recursos PWA esenciales).
// Next.js ya gestiona el versionado de JS/CSS con content-hash en los URLs,
// así que no es necesario cachearlos aquí — hacerlo solo acumula basura.
const CACHE_NAME = 'ipesa-v4'

// Solo estos recursos se pre-cachean: son los necesarios para que la PWA
// funcione offline y para que el ícono/manifest aparezcan correctamente.
const PRECACHE = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

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
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch: network-first para todo ──────────────────────────────────────
// Next.js ya versiona sus bundles JS/CSS con hashes en el filename,
// así que el caché del navegador nativo los gestiona correctamente.
// El SW solo interviene para: iconos/manifest (cache-first) y fallback offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // API: siempre red — nunca cachear datos en tiempo real
  if (url.pathname.startsWith('/api/')) return

  // Navegación: red primero, fallback al home cacheado si no hay red
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/') ?? fetch(e.request))
    )
    return
  }

  // Recursos PWA (iconos, manifest): cache-first — son estables
  if (PRECACHE.some(p => url.pathname === p)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached ?? fetch(e.request))
    )
    return
  }

  // Todo lo demás (JS, CSS, fuentes, imágenes): red directa
  // Next.js usa content-hash filenames así que el cache HTTP nativo es suficiente
})

// ── Push: mostrar notificación nativa ────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return

  let payload = { title: 'IPESA Recordatorio', body: 'Tienes un recordatorio pendiente', url: '/recordatorios' }
  try { payload = { ...payload, ...e.data.json() } } catch {}

  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body:               payload.body,
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
      tag:                'ipesa-reminder',
      requireInteraction: true,
      vibrate:            [200, 100, 200],
      data:               { url: payload.url },
      actions: [
        { action: 'open',  title: 'Ver recordatorio' },
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
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
