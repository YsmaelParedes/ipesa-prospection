'use client'

/**
 * Manda a /api/client-errors los errores del navegador (los ve el dueño de la
 * plataforma en /admin). Solo se manda el mensaje y la ruta (sin parámetros).
 * Cada mensaje se manda una vez por carga de página y como máximo 5 por
 * carga, para que un error en bucle no inunde al servidor.
 */
const sent = new Set<string>()
const MAX_PER_PAGE = 5

export function sendClientError(message: string, kind: 'client' | 'render' = 'client') {
  try {
    const text = String(message || '').slice(0, 400)
    if (!text || sent.has(text) || sent.size >= MAX_PER_PAGE) return
    sent.add(text)
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, page: window.location.pathname.slice(0, 120), kind }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reportar nunca debe causar otro error
  }
}
