/**
 * Reglas de envío para campañas de WhatsApp — evitan que Meta baje la
 * calificación de calidad del número o restrinja el envío, aunque la
 * plantilla ya esté aprobada. Un número que no ha completado la
 * verificación de negocio arranca en el nivel más bajo de límite de
 * mensajes (250 clientes únicos/24h) y ese límite solo sube si la calidad
 * se mantiene alta — mandar todo de golpe sin pausas ni tope es lo que
 * más rápido tira esa calificación.
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

/** Pausa aleatoria entre CAMPAIGN_SEND_DELAY_MS y +CAMPAIGN_SEND_JITTER_MS */
export function campaignDelayMs(): number {
  return CAMPAIGN_SEND_DELAY_MS + Math.floor(Math.random() * CAMPAIGN_SEND_JITTER_MS)
}

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
