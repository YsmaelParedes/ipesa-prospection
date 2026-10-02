import { APP_NAME } from './brand'

/**
 * Datos del responsable para /terminos y /privacidad. Se configuran con
 * variables de entorno (NEXT_PUBLIC_LEGAL_NAME, NEXT_PUBLIC_LEGAL_ADDRESS,
 * NEXT_PUBLIC_CONTACT_EMAIL) para no fijar datos de la empresa en el código.
 * Ambos textos deben revisarse con un abogado antes de vender el servicio.
 */
export const LEGAL = {
  product: APP_NAME,
  owner: process.env.NEXT_PUBLIC_LEGAL_NAME || `el titular de ${APP_NAME}`,
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || null,
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  jurisdiction: 'Puebla, Puebla',
  updatedAt: '2 de octubre de 2026',
}
