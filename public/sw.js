// ── IPESA CRM — Service Worker ────────────────────────────────────────────
// Versión: v1 — actualizar al hacer cambios importantes
const CACHE_NAME = 'ipesa-v2'
const PRECACHE   = ['/', '/manifest.json', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']

// ── Install: pre-cachear assets básicos ──────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: limpiar caches viejos, tomar control ───────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch: network-first para navegación y API, cache-first para assets ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // Calls a API: siempre red (datos en tiempo real)
  if (url.pathname.startsWith('/api/')) return

  // Navegación: red primero, fallback al home cacheado
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    )
    return
  }

  // Recursos estáticos: cache primero, luego red y cachear
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return response
      })
    })
  )
})

// ── Push: mostrar notificación nativa ────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return

  let payload = { title: 'IPESA Recordatorio', body: 'Tienes un recordatorio pendiente', url: '/recordatorios' }
  try { payload = { ...payload, ...e.data.json() } } catch {}

  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body:             payload.body,
      icon:             '/icon-192.png',
      badge:            '/icon-192.png',
      tag:              'ipesa-reminder',
      requireInteraction: true,
      vibrate:          [200, 100, 200],
      data:             { url: payload.url },
      actions: [
        { action: 'open',   title: 'Ver recordatorio' },
        { action: 'close',  title: 'Cerrar' },
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
      // Si ya hay una ventana abierta, enfocamos y navegamos
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(url)
          return
        }
      }
      // Si no, abrimos nueva ventana
      return self.clients.openWindow(url)
    })
  )
})
