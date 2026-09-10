/**
 * Catálogo local de plantillas de WhatsApp ya aprobadas en Meta. Agrega una
 * entrada aquí cada vez que se apruebe una plantilla nueva — el texto es
 * solo para la vista previa dentro de la app; el envío real usa el `name`
 * exacto y Meta manda el contenido aprobado, así que un texto desactualizado
 * aquí no rompe el envío, solo se ve distinto en la vista previa.
 */
export type WhatsAppTemplateDef = {
  name: string
  language: string
  label: string
  hasImageHeader: boolean
  bodyPreview: string   // usa {{1}} igual que la plantilla real
  footer?: string
  buttonLabel?: string
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDef[] = [
  {
    name: 'promo_aplazo_pinturas',
    language: 'es_MX',
    label: 'Promo Aplazo · Pinturas en plazos',
    hasImageHeader: true,
    bodyPreview: '¡Hola {{1}}! 🎉 Ahora puedes pagar pinturas IPESA en plazos quincenales, sin tarjeta, con Aplazo. ¡No te lo pierdas! Te esperamos en Hidalgo 31 Local 2, Santa Clara Ocoyucan, Puebla.',
    footer: 'Sujeto a aprobación y condiciones de Aplazo',
    buttonLabel: 'Dame Información !',
  },
]
