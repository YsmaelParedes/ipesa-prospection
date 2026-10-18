import { APP_NAME } from './brand'

/**
 * Datos del responsable para /terminos y /privacidad, y contacto para pedir
 * una invitación. Se configuran con variables de entorno
 * (NEXT_PUBLIC_LEGAL_NAME, NEXT_PUBLIC_LEGAL_ADDRESS, NEXT_PUBLIC_CONTACT_EMAIL,
 * NEXT_PUBLIC_CONTACT_WHATSAPP) para no fijar datos de la empresa en el código.
 * Ambos textos deben revisarse con un abogado antes de vender el servicio.
 */
export const LEGAL = {
  product: APP_NAME,
  owner: process.env.NEXT_PUBLIC_LEGAL_NAME || `el titular de ${APP_NAME}`,
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || null,
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  /** Solo dígitos; 10 dígitos se toman como número de México (52) */
  whatsapp: (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || '').replace(/\D/g, '') || null,
  jurisdiction: 'Puebla, Puebla',
  updatedAt: '18 de octubre de 2026',
}

/**
 * Enlaces para escribirnos por WhatsApp o correo (dudas, sucursales adicionales, factura).
 * null si no hay WhatsApp o correo configurado.
 */
export function requestInviteLinks(message = `Hola, me interesa ${APP_NAME} para mi tienda de pinturas.`) {
  const wa = LEGAL.whatsapp ? (LEGAL.whatsapp.length === 10 ? `52${LEGAL.whatsapp}` : LEGAL.whatsapp) : null
  return {
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}` : null,
    email: LEGAL.email ? `mailto:${LEGAL.email}?subject=${encodeURIComponent(`${APP_NAME} para mi tienda`)}&body=${encodeURIComponent(message)}` : null,
  }
}
