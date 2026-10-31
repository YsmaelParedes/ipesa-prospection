/**
 * Opciones de las cookies de sesión de Supabase (sb-*). Solo el servidor las
 * lee (no hay cliente de Supabase en el navegador), así que van httpOnly:
 * un script de la página no puede robar el token de sesión.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
}
