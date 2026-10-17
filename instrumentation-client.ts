import { sendClientError } from './lib/clientErrorReport'

/**
 * Errores de JavaScript y promesas rechazadas en el navegador → aviso al dueño
 * de la plataforma. Se ignora lo que no es de la app: scripts de otros sitios
 * ("Script error."), extensiones del navegador y un aviso inofensivo del navegador.
 */
window.addEventListener('error', event => {
  try {
    const file = event.filename || ''
    if (file && !file.startsWith(window.location.origin)) return
    const message = event.message || ''
    if (!message || /^Script error\.?$/i.test(message) || /ResizeObserver loop/i.test(message)) return
    sendClientError(message)
  } catch {}
})

window.addEventListener('unhandledrejection', event => {
  try {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : ''
    if (!message || /\b(aborted|AbortError)\b/i.test(message) || /Failed to fetch|Load failed|NetworkError/i.test(message)) return
    sendClientError(message)
  } catch {}
})
