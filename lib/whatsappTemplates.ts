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
  /** Texto de todos los botones, en orden (Campañas los muestra en la vista previa). */
  buttons?: string[]
  /** Los botones con su tipo (ícono en la vista previa; datos para corregir una plantilla). */
  buttonList?: TemplateButton[]
  /** Encabezado de texto (sin variables), si tiene. */
  headerText?: string
  /** Ejemplos que se dieron a Meta para cada {{n}} del cuerpo (pueden faltar). */
  examples?: string[]
  /** Hecha en Matices con el nombre del cliente: {{1}} es el nombre de cada contacto. */
  clientName?: boolean
  unsupported?: string         // motivo si la app no puede llenarla (p. ej. variables en encabezado/botón)
  quality?: string             // calidad en Meta: GREEN | YELLOW | RED | UNKNOWN
}

export type TemplateButton = { kind: 'reply' | 'url' | 'call' | 'other'; text: string; url?: string; phone?: string }

/** Una plantilla de la tienda con su estado en WhatsApp (sección Plantillas). */
export type ManagedTemplate = WhatsAppTemplateDef & {
  id: string
  /** APPROVED | PENDING | IN_APPEAL | REJECTED | PAUSED | DISABLED… */
  status: string
  /** Por qué la rechazó WhatsApp (código de Meta), si aplica. */
  rejectedReason?: string
  /** Formato del encabezado en Meta (TEXT, IMAGE, VIDEO, DOCUMENT…), si tiene. */
  headerFormat?: string
}

export type TemplateState = 'ok' | 'review' | 'rejected' | 'paused' | 'off'

/** El estado de Meta en palabras de la tienda. */
export function templateState(status: string): TemplateState {
  if (status === 'APPROVED') return 'ok'
  if (status === 'PENDING' || status === 'IN_APPEAL') return 'review'
  if (status === 'REJECTED') return 'rejected'
  if (status === 'PAUSED') return 'paused'
  return 'off'
}

export const STATE_LABEL: Record<TemplateState, string> = {
  ok: 'Aprobada', review: 'En revisión', rejected: 'Rechazada', paused: 'Pausada', off: 'Desactivada',
}

/** Por qué WhatsApp la rechazó (rejected_reason de Meta), en palabras sencillas. */
export function rejectionText(reason?: string): string {
  switch (reason) {
    case 'PROMOTIONAL':
    case 'INCORRECT_CATEGORY': return 'WhatsApp la consideró una promoción y el tipo elegido no coincide. Cámbiala a Marketing o quita lo que suene a oferta.'
    case 'INVALID_FORMAT': return 'El formato no es válido: revisa que los datos que cambian no estén al principio o al final, que no vayan juntos y que cada uno tenga su ejemplo.'
    case 'TAG_CONTENT_MISMATCH': return 'El contenido no coincide con el tipo elegido (Marketing o Utilidad).'
    case 'ABUSIVE_CONTENT': return 'WhatsApp consideró que el contenido no cumple sus políticas.'
    case 'SCAM': return 'WhatsApp la marcó como posible engaño. Revisa que el mensaje sea claro y no pida datos personales.'
    default: return 'WhatsApp no dio un motivo específico. Revisa el texto, los ejemplos y el tipo, y vuelve a enviarla.'
  }
}
