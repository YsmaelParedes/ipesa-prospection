/**
 * Tipos y textos compartidos del historial de campañas de WhatsApp
 * (cliente y servidor; sin dependencias de Node).
 */

/** Por qué no se entregó un mensaje, agrupado en motivos que se pueden explicar. */
export type FailureKind =
  | 'no_whatsapp'      // 131026: sin WhatsApp o sin aceptar los términos nuevos
  | 'marketing_limit'  // 131049: tope de mensajes de marketing por persona (temporal)
  | 'opt_out'          // 131050: pidió no recibir marketing
  | 'rate_limit'       // 131056 / 130429: demasiado rápido
  | 'quality'          // 131048: calidad baja del número
  | 'template'         // variables, imagen o plantilla inválidas
  | 'token'            // el acceso a WhatsApp venció
  | 'other'

export type FailureKindInfo = {
  title: string
  hint: string
  /** ¿Tiene sentido volver a intentarlo más tarde sin cambiar nada? */
  retry: boolean
}

export const FAILURE_KINDS: Record<FailureKind, FailureKindInfo> = {
  no_whatsapp: {
    title: 'Sin WhatsApp o sin aceptar los términos nuevos',
    hint: 'Suele ser un teléfono fijo o una línea sin WhatsApp (a veces, alguien que aún no acepta los términos nuevos). Mientras Meta lo siga reportando así, ya no se le envían campañas; si necesitas contactarlo, llámale.',
    retry: false,
  },
  marketing_limit: {
    title: 'Límite de marketing de Meta por persona',
    hint: 'Es temporal: Meta no entrega a quien ya recibió muchos mensajes de marketing. Puedes volver a intentarlo en unos días.',
    retry: true,
  },
  opt_out: {
    title: 'Pidió no recibir mensajes de marketing',
    hint: 'Respeta su decisión: no se le deben mandar más campañas.',
    retry: false,
  },
  rate_limit: {
    title: 'Meta pidió esperar entre envíos',
    hint: 'Fue por la velocidad del envío. Se puede reintentar en unos minutos.',
    retry: true,
  },
  quality: {
    title: 'Meta limitó el envío por la calidad del número',
    hint: 'Pausa las campañas unos días y revisa la calidad del número.',
    retry: false,
  },
  template: {
    title: 'Problema con la plantilla',
    hint: 'Meta rechazó las variables, la imagen o la plantilla. Revísala antes de volver a enviar.',
    retry: false,
  },
  token: {
    title: 'El acceso a WhatsApp venció',
    hint: 'Hay que renovar la conexión en Configuración → WhatsApp.',
    retry: false,
  },
  other: {
    title: 'Otro motivo',
    hint: '',
    retry: false,
  },
}

/** Estado simplificado de un mensaje de campaña. */
export type CampaignBucket = 'read' | 'delivered' | 'pending' | 'failed'

export type CampaignSummary = {
  /** `${plantilla}.${inicio en ms}` — identifica una campaña (un envío). */
  id: string
  template: string
  startedAt: string
  endedAt: string
  total: number
  read: number
  delivered: number
  /** Enviados, pero Meta aún no confirma la entrega. */
  pending: number
  failed: number
  /** Personas que escribieron dentro de las 72 h siguientes al envío. */
  replied: number
  failures: { kind: FailureKind; count: number }[]
}

export type CampaignRecipient = {
  phone: string
  contactId: string | null
  name: string | null
  segment: string | null
  bucket: CampaignBucket
  sentAt: string
  updatedAt: string
  kind: FailureKind | null
  error: string | null
  replied: boolean
  /** Veces que ya había fallado por el mismo motivo antes de esta campaña. */
  previousFailures: number
  lastFailedAt: string | null
  /** Ya recibió la misma plantilla en un envío posterior (p. ej. un reintento). */
  receivedLater: boolean
  /** Veces que se le intentó mandar dentro de esta campaña (varias personas del equipo pudieron enviar a la vez). */
  attempts: number
}

export type CampaignDetail = CampaignSummary & { recipients: CampaignRecipient[] }

/** Pausa máxima entre mensajes de una misma campaña (si pasa más, es otra campaña). */
export const BATCH_GAP_MS = 30 * 60 * 1000
/** Una respuesta cuenta si llega dentro de este tiempo después del envío. */
export const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000

export const campaignIdOf = (template: string, startMs: number) => `${template}.${startMs}`

export function parseCampaignId(id: string): { template: string; startMs: number } | null {
  const m = /^([a-z0-9_]{1,512})\.(\d{10,14})$/.exec(id)
  return m ? { template: m[1], startMs: Number(m[2]) } : null
}

// ── Resultados por persona ───────────────────────────────────────────────────

/**
 * Cómo le fue a cada número con las campañas. Se decide en este orden:
 * dado de baja → sin WhatsApp → respondió → estado de su último mensaje.
 */
export type PersonState =
  | 'replied'      // escribió dentro de las 72 h siguientes a alguna campaña
  | 'read'
  | 'delivered'
  | 'pending'      // Meta aún no confirma la entrega
  | 'meta_limit'   // Meta no lo entregó por un límite temporal (se puede reintentar)
  | 'failed'       // no le llegó por otro motivo
  | 'no_whatsapp'  // lo último que dijo Meta es que no tiene WhatsApp: ya no se le envía
  | 'opt_out'      // pidió no recibir campañas

export const PERSON_STATES: Record<PersonState, { label: string; chip: string }> = {
  replied:     { label: 'Respondieron',          chip: 'Respondió' },
  read:        { label: 'Leyeron, sin responder', chip: 'Leyó' },
  delivered:   { label: 'Entregados, sin leer',  chip: 'Entregado' },
  pending:     { label: 'Sin confirmar',         chip: 'Sin confirmar' },
  meta_limit:  { label: 'Límite de Meta',        chip: 'Límite de Meta' },
  failed:      { label: 'No les llegó',          chip: 'No le llegó' },
  no_whatsapp: { label: 'Sin WhatsApp',          chip: 'Sin WhatsApp' },
  opt_out:     { label: 'Dados de baja',         chip: 'Dado de baja' },
}

export const PERSON_STATE_ORDER: PersonState[] = ['replied', 'read', 'delivered', 'pending', 'meta_limit', 'failed', 'no_whatsapp', 'opt_out']

/** Solo se toman en cuenta los mensajes del último año. */
export const PEOPLE_WINDOW_DAYS = 365

export type CampaignPerson = {
  phone: string
  contactId: string | null
  name: string | null
  segment: string | null
  state: PersonState
  /** Plantillas que se le han mandado en el periodo. */
  sends: number
  lastTemplate: string
  lastSentAt: string
  lastUpdatedAt: string
  repliedAt: string | null
  /** Motivo del último fallo, tal como lo guardó la app. */
  error: string | null
  /** Veces seguidas que Meta respondió que no tiene WhatsApp (solo en 'no_whatsapp'). */
  noWhatsAppFailures: number
  lastFailedAt: string | null
}

/** Lo último que Meta respondió sobre un número sin WhatsApp. */
export type NoWhatsApp = { failures: number; lastFailedAt: string }
