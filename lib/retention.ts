/**
 * Plazos de la eliminación de tiendas inactivas (Términos › Cancelación).
 * Compartido por el cron, el panel del dueño y los textos legales.
 * Si cambias un número, cambia también los Términos y el Aviso de privacidad.
 */
export const RETENTION_IDLE_MONTHS = 6
/** 6 meses en días (lo usa la base: store_retention_status) */
export const RETENTION_IDLE_DAYS = 183
/** Primer aviso: tantos días antes de eliminarla */
export const RETENTION_NOTICE_DAYS = 30
/** Último aviso: tantos días antes (y nunca menos tiempo desde que se envía) */
export const RETENTION_LAST_NOTICE_DAYS = 7
