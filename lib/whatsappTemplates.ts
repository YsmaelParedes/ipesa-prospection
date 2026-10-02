/**
 * Forma común de una plantilla aprobada. Las plantillas de cada tienda se
 * consultan en vivo a Meta (/api/whatsapp/templates). El envío real usa el
 * `name` exacto y Meta manda el contenido aprobado; el texto solo se usa
 * para la vista previa y para guardar el mensaje en la bandeja.
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
