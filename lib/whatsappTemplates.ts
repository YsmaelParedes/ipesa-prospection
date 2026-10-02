/**
 * Forma común de una plantilla aprobada. Las plantillas se consultan en vivo
 * a Meta (/api/whatsapp/templates); este catálogo local solo es el respaldo
 * si la consulta falla o falta WHATSAPP_BUSINESS_ACCOUNT_ID. El envío real
 * usa el `name` exacto y Meta manda el contenido aprobado, así que un texto
 * desactualizado aquí no rompe el envío, solo se ve distinto en la vista previa.
 */
export type WhatsAppTemplateDef = {
  name: string
  language: string
  label: string
  category?: string            // MARKETING | UTILITY | AUTHENTICATION
  hasImageHeader: boolean
  bodyPreview: string          // usa {{1}}, {{2}}… igual que la plantilla real
  variableCount?: number       // variables {{n}} del cuerpo
  footer?: string
  buttonLabel?: string
  unsupported?: string         // motivo si la app no puede llenarla (p. ej. variables en encabezado/botón)
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDef[] = [
  {
    name: 'promo_aplazo_pinturas',
    language: 'es_MX',
    label: 'Promo Aplazo · Pinturas en plazos',
    category: 'MARKETING',
    hasImageHeader: true,
    bodyPreview: '¡Hola {{1}}! 🎉 Ahora puedes pagar pinturas IPESA en plazos quincenales, sin tarjeta, con Aplazo. ¡No te lo pierdas! Te esperamos en Hidalgo 31 Local 2, Santa Clara Ocoyucan, Puebla.',
    variableCount: 1,
    footer: 'Sujeto a aprobación y condiciones de Aplazo',
    buttonLabel: 'Dame Información !',
  },
]
