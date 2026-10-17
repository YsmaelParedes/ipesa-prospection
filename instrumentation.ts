import type { Instrumentation } from 'next'

/**
 * Errores que se escapan sin atrapar en el servidor (render, rutas, acciones,
 * proxy): se guardan y se avisa al dueño de la plataforma (lib/errorReport.ts).
 * Los errores que una ruta atrapa y responde con serverError() ya se reportan
 * ahí mismo y no llegan aquí. Solo corre en Node: web-push y el cliente de
 * Supabase no funcionan en Edge.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { reportErrorNow } = await import('./lib/errorReport')
    const { ACTIVE_STORE_COOKIE } = await import('./lib/supabase-server')
    // La tienda activa viaja en la cookie; no se guarda nada más de la petición.
    const header = request.headers.cookie
    const cookie = Array.isArray(header) ? header.join('; ') : header ?? ''
    const store = new RegExp(`(?:^|;\\s*)${ACTIVE_STORE_COOKIE}=([0-9a-f-]{36})`, 'i').exec(cookie)?.[1] ?? null
    await reportErrorNow({
      source: context.routeType === 'render' ? 'render' : 'server',
      context: `${request.method} ${context.routePath}`,
      error: err,
      storeId: store,
    })
  } catch {
    // Reportar nunca debe causar otro error
  }
}
