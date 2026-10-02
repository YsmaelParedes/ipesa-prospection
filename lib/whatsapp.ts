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
  error?: string
  code?: number
}


/**
 * Errores frecuentes de Meta traducidos a algo accionable. El texto original
 * de Meta va en inglés y es críptico ("(#131047) Re-engagement message").
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const FRIENDLY_ERRORS: Record<number, string> = {
  131047: 'Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla aprobada.',
  131026: 'El mensaje no se pudo entregar (el número no tiene WhatsApp o no aceptó los términos recientes).',
  131049: 'Meta no entregó esta plantilla para cuidar la experiencia del usuario (límite de mensajes de marketing por persona). Intenta más adelante.',
  131050: 'El cliente pidió dejar de recibir mensajes de marketing de este número.',
  131051: 'Tipo de mensaje no soportado.',
  131056: 'Demasiados mensajes al mismo número en poco tiempo. Espera un momento.',
  130429: 'Se alcanzó el límite de velocidad de envío de Meta. Espera unos minutos.',
  131048: 'Meta limitó el envío por baja calidad del número (muchos bloqueos o reportes). Pausa las campañas.',
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
    return { ok: true, messageId: data?.messages?.[0]?.id }
  } catch (error: any) {
    return { ok: false, error: error?.name === 'TimeoutError' ? 'Meta tardó demasiado en responder' : 'Error de red al contactar la API de WhatsApp' }
  }
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
  return postMessage(creds, {
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
  return postMessage(creds, { to, type: 'text', text: { body, preview_url: true } })
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
export async function downloadWhatsAppMedia(creds: WhatsAppCreds, mediaId: string): Promise<{ body: ArrayBuffer; mime: string } | null> {
  const meta = await graphFetch(creds, encodeURIComponent(mediaId)).catch(() => null)
  const url = meta?.ok ? meta.data?.url as string | undefined : undefined
  // La URL debe ser de Meta: nunca seguir una URL arbitraria con el token.
  if (!url || !/^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(url)) return null
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${creds.token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  if (!res?.ok) return null
  return { body: await res.arrayBuffer(), mime: res.headers.get('content-type') || meta?.data?.mime_type || 'application/octet-stream' }
}

export type PhoneHealth = {
  displayPhoneNumber?: string
  verifiedName?: string
  qualityRating?: string       // GREEN | YELLOW | RED | UNKNOWN
  messagingLimitTier?: string  // TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  nameStatus?: string
}

/** Calidad del número y nivel de mensajería — clave para no ser restringido por Meta. */
export async function getPhoneHealth(creds: WhatsAppCreds): Promise<PhoneHealth | null> {
  const { ok, data } = await graphFetch(
    creds,
    `${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status`,
  ).catch(() => ({ ok: false, data: null }))
  if (!ok || !data) return null
  return {
    displayPhoneNumber: data.display_phone_number,
    verifiedName:       data.verified_name,
    qualityRating:      data.quality_rating,
    messagingLimitTier: data.messaging_limit_tier,
    nameStatus:         data.name_status,
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
