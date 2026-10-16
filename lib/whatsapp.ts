/**
 * Cliente de servidor para WhatsApp Cloud API (Meta oficial, sin BSP).
 * Cada tienda usa su propio número: todas las funciones reciben las
 * credenciales de la tienda (ver lib/storeWhatsApp.ts). La tienda que migró
 * del modelo de una sola tienda usa las variables de entorno:
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID,
 *   WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN
 *   WHATSAPP_GRAPH_VERSION        opcional, versión de Graph API (default v21.0)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readBoundedBody } from './boundedBody'

export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'

export type WhatsAppCreds = {
  token: string
  phoneNumberId: string
  wabaId: string | null
  appSecret: string | null
}

export type WhatsAppTemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'image'; image: { link: string } }

export type WhatsAppTemplateComponent = {
  type: 'body' | 'header' | 'button'
  parameters: WhatsAppTemplateParameter[]
}

export type WhatsAppSendResult = {
  ok: boolean
  messageId?: string
  /** `held_for_quality_assessment`: Meta retiene la plantilla para medir su calidad (template pacing). */
  messageStatus?: string
  error?: string
  code?: number
}


/**
 * Errores frecuentes de Meta traducidos a algo accionable. El texto original
 * de Meta va en inglés y es críptico ("(#131047) Re-engagement message").
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
 */
export const FRIENDLY_ERRORS: Record<number, string> = {
  131047: 'Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla aprobada.',
  131026: 'El mensaje no se pudo entregar (el número no tiene WhatsApp o no aceptó los términos recientes).',
  131049: 'Meta no entregó esta plantilla porque la persona alcanzó su límite de mensajes de marketing. Meta pide esperar al menos 24 h antes de reenviársela.',
  131050: 'El cliente se dio de baja de los mensajes de marketing de tu negocio. Meta pide no volver a enviárselos.',
  131051: 'Tipo de mensaje no soportado.',
  131056: 'Demasiados mensajes al mismo número en poco tiempo. Espera un momento.',
  130429: 'Se alcanzó el límite de velocidad de envío de Meta. Espera unos minutos.',
  131048: 'Meta restringió el envío desde este número (por bloqueos o reportes de spam). Revisa la calidad en el administrador de WhatsApp.',
  131031: 'Meta restringió o desactivó la cuenta de WhatsApp Business por una infracción de políticas.',
  368:    'Meta restringió o desactivó la cuenta de WhatsApp Business por una infracción de políticas.',
  131064: 'Meta limitó los envíos de la cuenta por plantillas mal clasificadas. Se libera solo al terminar el periodo de sanción.',
  132015: 'Meta pausó esta plantilla por baja calidad. Edítala en Meta y vuelve a enviarla cuando esté aprobada.',
  132000: 'El número de variables no coincide con la plantilla aprobada.',
  132001: 'La plantilla no existe o no está aprobada en ese idioma.',
  132012: 'El formato de las variables de la plantilla no es válido.',
  131009: 'Algún parámetro no es válido (revisa la imagen de encabezado y las variables).',
  190:    'El token de acceso de WhatsApp expiró o no es válido. Hay que renovarlo en Meta.',
  100:    'Parámetro inválido en la petición a Meta.',
}

export function friendlyWhatsAppError(code: number | undefined, fallback: string): string {
  return (code !== undefined && FRIENDLY_ERRORS[code]) || fallback
}

export async function graphFetch(creds: Pick<WhatsAppCreds, 'token'>, path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

async function postMessage(creds: WhatsAppCreds, payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  try {
    const { ok, status, data } = await graphFetch(creds, `${creds.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })
    if (!ok) {
      const code = data?.error?.code as number | undefined
      const raw  = data?.error?.error_data?.details || data?.error?.message || `Error HTTP ${status}`
      return { ok: false, code, error: friendlyWhatsAppError(code, raw) }
    }
    return { ok: true, messageId: data?.messages?.[0]?.id, messageStatus: data?.messages?.[0]?.message_status }
  } catch (error: any) {
    return { ok: false, error: error?.name === 'TimeoutError' ? 'Meta tardó demasiado en responder' : 'Error de red al contactar la API de WhatsApp' }
  }
}

// Límite de velocidad (130429) y de mensajes a la misma persona (131056):
// Meta pide reintentar a los 4^X segundos (1 s, 4 s, 16 s…).
const RETRY_CODES = new Set([130429, 131056])
const MAX_RETRIES = 2

async function postWithBackoff(creds: WhatsAppCreds, payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  let result = await postMessage(creds, payload)
  for (let x = 0; x < MAX_RETRIES && !result.ok && result.code && RETRY_CODES.has(result.code); x++) {
    await new Promise(r => setTimeout(r, 4 ** x * 1000))
    result = await postMessage(creds, payload)
  }
  return result
}

/**
 * Envía un mensaje de plantilla (obligatorio fuera de la ventana de 24h de
 * atención al cliente). `to` en formato E.164 sin "+" (ej. 5212221234567).
 */
export function sendWhatsAppTemplate(
  creds: WhatsAppCreds,
  to: string,
  templateName: string,
  languageCode = 'es_MX',
  components?: WhatsAppTemplateComponent[],
): Promise<WhatsAppSendResult> {
  return postWithBackoff(creds, {
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  })
}

/** Texto libre — solo dentro de las 24 h desde el último mensaje del cliente. */
export function sendWhatsAppText(creds: WhatsAppCreds, to: string, body: string): Promise<WhatsAppSendResult> {
  return postWithBackoff(creds, { to, type: 'text', text: { body, preview_url: true } })
}

/**
 * Sube un archivo a Meta para poder enviarlo (Meta lo guarda ~30 días; con el
 * mismo id se descarga después para mostrarlo en el chat). Devuelve su id.
 */
export async function uploadWhatsAppMedia(
  creds: WhatsAppCreds, file: Blob, filename: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string; code?: number }> {
  try {
    const form = new FormData()
    form.append('messaging_product', 'whatsapp')
    form.append('type', file.type)
    form.append('file', file, filename)
    // Sin Content-Type: fetch arma el multipart con su boundary
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/media`, {
      method: 'POST', headers: { Authorization: `Bearer ${creds.token}` }, body: form,
      cache: 'no-store', signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.id) {
      const code = data?.error?.code as number | undefined
      const raw  = data?.error?.error_data?.details || data?.error?.message || `Error HTTP ${res.status}`
      return { ok: false, code, error: friendlyWhatsAppError(code, raw) }
    }
    return { ok: true, id: String(data.id) }
  } catch (error: any) {
    return { ok: false, error: error?.name === 'TimeoutError' ? 'Meta tardó demasiado en recibir el archivo' : 'Error de red al subir el archivo a WhatsApp' }
  }
}

/** Foto, video o documento ya subido a Meta — solo dentro de las 24 h, como el texto libre. */
export function sendWhatsAppMedia(
  creds: WhatsAppCreds, to: string, kind: 'image' | 'video' | 'document', mediaId: string,
  opts: { caption?: string; filename?: string } = {},
): Promise<WhatsAppSendResult> {
  return postWithBackoff(creds, {
    to,
    type: kind,
    [kind]: {
      id: mediaId,
      ...(opts.caption ? { caption: opts.caption } : {}),
      ...(kind === 'document' && opts.filename ? { filename: opts.filename } : {}),
    },
  })
}

/** Marca un mensaje entrante como leído (palomitas azules para el cliente). */
export async function markWhatsAppRead(creds: WhatsAppCreds, waMessageId: string): Promise<void> {
  await graphFetch(creds, `${creds.phoneNumberId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waMessageId }),
  }).catch(() => {})
}

/**
 * Descarga un archivo multimedia entrante. Meta solo entrega una URL
 * temporal (≈5 min) que a su vez exige el token, así que la app hace de
 * proxy: el navegador nunca ve el token.
 */
/** Tope de lo que el servidor descarga por archivo (los videos de WhatsApp llegan hasta 16 MB). */
const MAX_MEDIA_DOWNLOAD_BYTES = 16 * 1024 * 1024

export async function downloadWhatsAppMedia(creds: WhatsAppCreds, mediaId: string): Promise<{ body: ArrayBuffer; mime: string } | null> {
  const meta = await graphFetch(creds, encodeURIComponent(mediaId)).catch(() => null)
  const url = meta?.ok ? meta.data?.url as string | undefined : undefined
  // La URL debe ser de Meta: nunca seguir una URL arbitraria con el token.
  if (!url || !/^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(url)) return null
  if (Number(meta?.data?.file_size) > MAX_MEDIA_DOWNLOAD_BYTES) return null
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  if (!res?.ok) return null
  if (Number(res.headers.get('content-length')) > MAX_MEDIA_DOWNLOAD_BYTES) {
    await res.body?.cancel().catch(() => {})
    return null
  }
  const body = await readBoundedBody(res.body, MAX_MEDIA_DOWNLOAD_BYTES)
  if (!body) return null
  return { body: body.buffer as ArrayBuffer, mime: res.headers.get('content-type') || meta?.data?.mime_type || 'application/octet-stream' }
}

export type PhoneHealth = {
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string       // GREEN | YELLOW | RED | UNKNOWN
  messagingLimitTier?: string  // TIER_250 | TIER_2K | TIER_10K | TIER_100K | TIER_UNLIMITED
  nameStatus?: string
  /** health_status de Meta: AVAILABLE | LIMITED | BLOCKED */
  canSendMessage?: string
  /** Motivos de Meta cuando el estado es LIMITED o BLOCKED. */
  healthNotes?: string[]
}

/** Primer valor TIER_* de la respuesta (Meta lo devuelve como texto; se tolera un objeto). */
function tierOf(value: unknown): string | undefined {
  if (typeof value === 'string') return /^TIER_/.test(value) ? value : undefined
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) { const t = tierOf(v); if (t) return t }
  }
  return undefined
}

// health_status también reporta llamadas (SIP), que no afectan el envío de mensajes
const CALLING_NOTE = /\bSIP\b|\bcalling\b/i
const DISPLAY_NAME_NOTE = /display name has not been approved/i
// Lo demás llega en inglés y con términos técnicos: a la tienda solo se le da un aviso general
const GENERIC_NOTE = 'Meta reportó una restricción en tu número. Tu asesor la revisará contigo.'

async function phoneFields(creds: WhatsAppCreds, fields: string): Promise<any | null> {
  const { ok, data } = await graphFetch(creds, `${creds.phoneNumberId}?fields=${fields}`).catch(() => ({ ok: false, data: null }))
  return ok && data ? data : null
}

/**
 * Calidad, nivel de mensajería y estado de salud del número. Cada dato va en
 * su propia consulta: si una versión de Graph no conoce un campo, el resto
 * sigue funcionando.
 *  · whatsapp_business_manager_messaging_limit: nivel del portafolio
 *    (messaging_limit_tier quedó obsoleto y solo es respaldo).
 *  · health_status: AVAILABLE / LIMITED / BLOCKED (support/health-status).
 */
export async function getPhoneHealth(creds: WhatsAppCreds): Promise<PhoneHealth | null> {
  const [base, limit, health] = await Promise.all([
    phoneFields(creds, 'display_phone_number,verified_name,quality_rating,name_status'),
    phoneFields(creds, 'whatsapp_business_manager_messaging_limit'),
    phoneFields(creds, 'health_status'),
  ])
  if (!base) return null
  let tier = tierOf(limit?.whatsapp_business_manager_messaging_limit)
  if (!tier) tier = tierOf((await phoneFields(creds, 'messaging_limit_tier'))?.messaging_limit_tier)

  const entities: any[] = Array.isArray(health?.health_status?.entities) ? health.health_status.entities : []
  const healthNotes = entities.flatMap(e => [
    ...(Array.isArray(e?.errors) ? e.errors.map((x: any) => [x?.error_description, x?.possible_solution].filter(Boolean).join(' ')) : []),
    ...(Array.isArray(e?.additional_info) ? e.additional_info : typeof e?.additional_info === 'string' ? [e.additional_info] : []),
  ]).filter((n): n is string => typeof n === 'string' && !!n.trim() && !CALLING_NOTE.test(n))
    .map(n => (DISPLAY_NAME_NOTE.test(n) ? 'Meta aún no aprueba el nombre visible del número; el límite de mensajes subirá cuando lo apruebe.' : GENERIC_NOTE))

  return {
    displayPhoneNumber: base.display_phone_number,
    verifiedName:       base.verified_name,
    qualityRating:      base.quality_rating,
    messagingLimitTier: tier,
    nameStatus:         base.name_status,
    canSendMessage:     health?.health_status?.can_send_message,
    healthNotes:        healthNotes.length ? [...new Set(healthNotes)] : undefined,
  }
}

/**
 * Verifica la firma X-Hub-Signature-256 que Meta agrega a cada POST del
 * webhook (HMAC-SHA256 del cuerpo crudo con el App Secret). Sin esto,
 * cualquiera podría inyectar mensajes falsos en la bandeja.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const received = header.slice('sha256='.length)
  if (!/^[0-9a-f]{64}$/i.test(received)) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest()
  return timingSafeEqual(Buffer.from(received, 'hex'), expected)
}

/** Valor de parámetro de plantilla aceptado por Meta (sin saltos de línea/tabs ni >4 espacios seguidos). */
export function sanitizeTemplateParam(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 200)
}

/** Cuenta las variables {{n}} distintas de un texto de plantilla. */
export function countTemplateVariables(text: string): number {
  const nums = new Set(Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g), m => m[1]))
  return nums.size
}

/** Sustituye {{1}}, {{2}}… por sus valores para guardar el texto real enviado. */
export function renderTemplateBody(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, n) => values[Number(n) - 1] ?? match)
}
