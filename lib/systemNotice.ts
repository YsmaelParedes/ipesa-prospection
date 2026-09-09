/**
 * Aviso de "sistema en mantenimiento/mejoras" mostrado como banner en toda
 * la app. Cambia `active` a false (o borra el bloque) cuando ya no aplique.
 * Cambiar el `id` hace que el banner vuelva a aparecer para quienes ya lo
 * habían cerrado (útil si hay un aviso nuevo).
 */
export const SYSTEM_NOTICE = {
  active: true,
  id: '2026-09-mejoras-whatsapp',
  message: 'Estamos haciendo mejoras al sistema (integración de WhatsApp). Podrías notar cambios temporales en Configuración — no afecta tus contactos, leads ni recordatorios.',
}
