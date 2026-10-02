/**
 * Reglas de envío para campañas de WhatsApp — evitan que Meta baje la
 * calificación de calidad del número o restrinja el envío, aunque la
 * plantilla ya esté aprobada. Un número que no ha completado la
 * verificación de negocio arranca en el nivel más bajo de límite de
 * mensajes (250 clientes únicos/24h) y ese límite solo sube si la calidad
 * se mantiene alta — mandar todo de golpe sin pausas ni tope es lo que
 * más rápido tira esa calificación.
 * Compartido por cliente y servidor (sin dependencias de Node).
 */

// Pausa entre cada envío dentro de una campaña (ms), con jitter para que el
// patrón no se vea perfectamente robótico. El cliente manda un contacto por
// petición y espera esto entre una y otra — así la función del servidor
// nunca queda esperando varios minutos (sin riesgo de timeout) y la UI
// puede mostrar una barra de progreso real en vez de un solo spinner ciego.
export const CAMPAIGN_SEND_DELAY_MS  = 3000
export const CAMPAIGN_SEND_JITTER_MS = 800

// Tope de plantillas enviadas por día (ventana móvil de 24h). Conservador
// mientras la verificación de negocio en Meta siga pendiente — se puede
// subir una vez que el número lleve semanas con buena calidad y/o la
// verificación esté aprobada.
export const CAMPAIGN_DAILY_LIMIT = 200

// No repetir la misma plantilla a la misma persona en este periodo: los
// envíos repetidos son la causa #1 de bloqueos/reportes.
export const TEMPLATE_REPEAT_DAYS = 7

// Ventana de atención al cliente de Meta: texto libre solo se puede enviar
// dentro de las 24 h siguientes al último mensaje del cliente.
export const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000

/** Pausa aleatoria entre CAMPAIGN_SEND_DELAY_MS y +CAMPAIGN_SEND_JITTER_MS */
export function campaignDelayMs(): number {
  return CAMPAIGN_SEND_DELAY_MS + Math.floor(Math.random() * CAMPAIGN_SEND_JITTER_MS)
}

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Tiempo estimado de una campaña (texto corto para la UI). */
export function campaignEtaLabel(count: number): string {
  const sec = Math.round(count * (CAMPAIGN_SEND_DELAY_MS + CAMPAIGN_SEND_JITTER_MS / 2) / 1000)
  return sec < 60 ? `~${sec}s` : `~${Math.ceil(sec / 60)} min`
}

/** Momento en que se cierra la ventana de 24 h (ms epoch) o null si nunca escribió. */
export function windowClosesAt(lastInboundAt: string | null | undefined): number | null {
  if (!lastInboundAt) return null
  const t = new Date(lastInboundAt).getTime()
  return Number.isFinite(t) ? t + CUSTOMER_WINDOW_MS : null
}

export function isWindowOpen(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  const closes = windowClosesAt(lastInboundAt)
  return closes !== null && closes > now
}

const OPT_OUT_PHRASES = new Set([
  'stop', 'baja', 'darme de baja', 'dar de baja', 'alto', 'unsubscribe',
  'detener promociones', 'stop promotions', 'no quiero recibir mensajes',
  'no quiero recibir promociones', 'no me envien mas mensajes', 'no me manden mas mensajes',
])

/**
 * ¿El cliente pidió no recibir más campañas? Solo frases completas y
 * explícitas (incluye el botón "Detener promociones" de Meta) — no se
 * interpreta texto libre para no dar de baja a alguien por error.
 */
export function isOptOutMessage(text: string): boolean {
  const n = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^👉\s*/u, '').replace(/[.!¡¿?]+/g, '').replace(/\s+/g, ' ').trim()
  return OPT_OUT_PHRASES.has(n)
}
