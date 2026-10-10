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
    hint: 'Suele ser un teléfono fijo, una línea sin WhatsApp o alguien que aún no acepta los términos nuevos. Si vuelve a fallar, conviene revisar el número.',
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
