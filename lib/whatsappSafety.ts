/**
 * Reglas de envío de WhatsApp tomadas de la documentación oficial de Meta
 * (developers.facebook.com/documentation/business-messaging/whatsapp/…):
 *  · messaging-limits: el límite es de PERSONAS ÚNICAS a las que se escribe
 *    fuera de la ventana de atención en 24 h móviles. Lo fija Meta por
 *    portafolio (250 → 2,000 → 10,000 → 100,000 → ilimitado) y se lee en vivo.
 *  · throughput: 80 mensajes/s por número (error 130429). A una misma
 *    persona, 1 cada 6 s (error 131056); reintentar a los 4^X segundos.
 *  · per-user-limits: con el error 131049 hay que esperar al menos 24 h
 *    antes de reenviarle una plantilla de marketing.
 *  · error-codes: 131050 = se dio de baja del marketing, no reintentar.
 * Compartido por cliente y servidor (sin dependencias de Node).
 */

// Nivel de Meta → personas únicas por 24 h (null = sin límite). TIER_50 y
// TIER_1K son niveles anteriores que aún pueden aparecer en cuentas viejas.
export const TIER_LIMITS: Record<string, number | null> = {
  TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000,
  TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: null,
}

// Nivel inicial oficial de un portafolio nuevo: se usa si Meta no responde.
export const FALLBACK_MESSAGING_LIMIT = 250

/** Texto corto del nivel para la UI. */
export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return '—'
  if (!(tier in TIER_LIMITS)) return tier
  const limit = TIER_LIMITS[tier]
  return limit === null ? 'Sin límite' : `${limit.toLocaleString('es-MX')} personas/día`
}

// 131049: esperar al menos 24 h antes de reenviar una plantilla de marketing.
export const MARKETING_RETRY_HOURS = 24

// Envío de campañas: el navegador manda lotes y el servidor los envía con
// poca concurrencia, muy por debajo de los 80 mensajes/s de Meta.
export const CAMPAIGN_BATCH_SIZE  = 20
export const CAMPAIGN_CONCURRENCY = 4

// Errores de Meta que afectan a todo el número, la cuenta o la plantilla:
// seguir enviando solo acumula fallos, así que la campaña se detiene.
// 131048 número restringido · 131031/368 cuenta restringida · 131064 límite por
// mala clasificación de plantillas · 132015 plantilla pausada · 190 token.
export const STOP_CAMPAIGN_CODES = [131048, 131031, 368, 131064, 132015, 190]

// Ventana de atención al cliente de Meta: texto libre solo se puede enviar
// dentro de las 24 h siguientes al último mensaje del cliente.
export const CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000

// Tiempo aproximado por mensaje (petición a Meta + registro), para estimar.
const APPROX_MS_PER_MESSAGE = 400

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Tiempo estimado de una campaña (texto corto para la UI). */
export function campaignEtaLabel(count: number): string {
  const sec = Math.max(1, Math.round(count * APPROX_MS_PER_MESSAGE / CAMPAIGN_CONCURRENCY / 1000))
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
