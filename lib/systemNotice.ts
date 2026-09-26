/**
 * Aviso de "sistema en mantenimiento/mejoras" mostrado como banner en toda
 * la app. Cambia `active` a false (o borra el bloque) cuando ya no aplique.
 * Cambiar el `id` hace que el banner vuelva a aparecer para quienes ya lo
 * habían cerrado (útil si hay un aviso nuevo).
 */
export const SYSTEM_NOTICE = {
  active: true,
  id: '2026-09-formulas',
  message: 'Estamos agregando la sección Fórmulas (igualación de colores). Podrías notar ajustes en los próximos días — no afecta tus contactos, leads ni recordatorios.',
}
