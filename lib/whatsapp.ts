/**
 * Envío de mensajes vía WhatsApp Cloud API (Meta oficial, sin BSP).
 * Requiere WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en el entorno.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? 'v26.0'

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
}

async function postToGraph(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const token         = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados' }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })

    const data = await res.json()

    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `Error HTTP ${res.status}` }
    }

    return { ok: true, messageId: data?.messages?.[0]?.id }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Error de red al contactar la API de WhatsApp' }
  }
}

/**
 * Envía un mensaje de plantilla (obligatorio fuera de la ventana de 24h de
 * atención al cliente). `to` debe ir en formato E.164 sin "+" (ej. 5212221234567).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'es_MX',
  components?: WhatsAppTemplateComponent[]
): Promise<WhatsAppSendResult> {
  return postToGraph({
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  })
}

/**
 * Envía texto libre — solo funciona dentro de la ventana de 24h desde el
 * último mensaje del cliente (si no, Meta responde con error de reenganche).
 */
export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  return postToGraph({
    to,
    type: 'text',
    text: { body },
  })
}

/**
 * Normaliza un número de WhatsApp (con código de país, ej. "5212221234567"
 * o "525212221234567") al formato de 10 dígitos usado en `contacts.phone`.
 * Misma lógica que normalizePhone() de components/IpesaUI.tsx, duplicada
 * aquí para evitar importar un archivo 'use client' desde código de servidor.
 */
export function normalizeWhatsAppPhone(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('521') && digits.length === 13) return digits.slice(3)
  if (digits.startsWith('52')  && digits.length === 12) return digits.slice(2)
  if (digits.startsWith('1')   && digits.length === 11) return digits.slice(1)
  if (digits.length > 10) return digits.slice(-10)
  return digits
}
