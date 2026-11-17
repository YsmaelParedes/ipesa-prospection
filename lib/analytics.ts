/**
 * Estadísticas del sitio con Umami (sin cookies ni datos personales).
 *
 * Solo envía desde www.matices.app (ni localhost ni vistas previas de Vercel).
 * El script y los envíos pasan por matices.app para
 * que los bloqueadores de anuncios no los corten:
 *   /m.js      → script de Umami (rewrite en next.config.ts)
 *   /api/send  → puente hacia Umami (app/api/send/route.ts)
 *
 * Qué se mide (filtro en components/Analytics.tsx):
 *   · Visitas: solo páginas públicas (portada sin sesión, /inicio/*, registro
 *     y legales). Las pantallas del CRM nunca se registran como visita.
 *   · Eventos: los de EVENTS, en cualquier página (embudo de registro y pago).
 *
 * Para no contar tus propias visitas: en la consola del navegador de
 * www.matices.app, localStorage.setItem('umami.disabled', '1').
 */

/**
 * ID del sitio www.matices.app en Umami Cloud. No es secreto (va en el HTML de
 * todas las páginas). NEXT_PUBLIC_UMAMI_WEBSITE_ID lo cambia; "off" lo apaga.
 */
const UMAMI_ENV_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
export const UMAMI_WEBSITE_ID = UMAMI_ENV_ID === 'off' ? '' : UMAMI_ENV_ID || '84f8fcbb-9b78-4712-88fe-ec02f1b9cd70'

/** Ruta pública del script de Umami (ver rewrites en next.config.ts). */
export const UMAMI_SCRIPT_PATH = '/m.js'

/** Nombres de los eventos tal como se ven en Umami (máx. 50 caracteres). */
export const EVENTS = {
  /** Clic en «Crear cuenta gratis» · donde: hero, menu, banda-final, precios-litro… */
  signupClick: 'Crear cuenta',
  /** Primera vez que alguien usa una demo en la página · demo */
  demoUsed: 'Demo usada',
  /** El registro funcionó (antes de confirmar el correo, si hace falta) */
  accountCreated: 'Cuenta creada',
  /** Clic en pagar un plan en Configuración → Plan · plan */
  checkoutStarted: 'Pago iniciado',
  /** Volvió de Stripe con el pago hecho · plan */
  planPurchased: 'Plan contratado',
} as const

export type EventName = typeof EVENTS[keyof typeof EVENTS]
type EventData = Record<string, string>

declare global {
  interface Window {
    umami?: { track: (name: string, data?: EventData) => Promise<unknown> }
  }
}

// Eventos que llegan antes de que cargue el script (p. ej. al volver de Stripe)
const pending: [EventName, EventData | undefined][] = []

/** Registra un evento (o lo guarda hasta que cargue Umami). Nunca falla ni frena la página. */
export function track(name: EventName, data?: EventData): void {
  try {
    if (window.umami) void window.umami.track(name, data)?.catch?.(() => {})
    else if (pending.length < 20) pending.push([name, data])
  } catch {}
}

/** Manda los eventos guardados; lo llama components/Analytics.tsx cuando carga el script. */
export function flushPendingEvents(): void {
  for (const [name, data] of pending.splice(0)) track(name, data)
}

/**
 * Atributos para registrar un clic sin escribir código (también en
 * componentes de servidor): <Link href="/registro" {...trackAttrs(EVENTS.signupClick, { donde: 'hero' })}>.
 * No se usa data-umami-event porque Umami frena el enlace hasta enviar el
 * evento y luego recarga la página completa.
 */
export function trackAttrs(name: EventName, data: EventData = {}): Record<string, string> {
  const attrs: Record<string, string> = { 'data-track': name }
  for (const [key, value] of Object.entries(data)) attrs[`data-track-${key}`] = value
  return attrs
}
