/**
 * Envío de mensajes vía WhatsApp Cloud API (Meta oficial, sin BSP).
 * Requiere WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en el entorno.
 */

const GRAPH_VERSION = 'v21.0'

export type WhatsAppTemplateComponent = {
  type: 'body' | 'header' | 'button'
  parameters: Array<{ type: 'text'; text: string }>
}

export type WhatsAppSendResult = {
  ok: boolean
  messageId?: string
  error?: string
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
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components?.length ? { components } : {}),
        },
      }),
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
