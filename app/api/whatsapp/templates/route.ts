import { NextResponse } from 'next/server'
import { getUserId, unauthorizedResponse } from '@/lib/supabase-server'
import type { WhatsAppTemplateDef } from '@/lib/whatsappTemplates'

const GRAPH_VERSION = 'v21.0'

/**
 * GET /api/whatsapp/templates — plantillas APROBADAS de la cuenta de
 * WhatsApp Business, consultadas en vivo desde Meta (en vez de mantener una
 * lista fija a mano que se desactualiza cada vez que se aprueba una nueva).
 * Requiere WHATSAPP_BUSINESS_ACCOUNT_ID además de WHATSAPP_ACCESS_TOKEN.
 * Responde 200 con `error` (y templates: []) en vez de fallar duro, para
 * que el cliente pueda caer de vuelta al catálogo local sin romper la UI.
 */
export async function GET() {
  const uid = await getUserId()
  if (!uid) return unauthorizedResponse()

  const token  = process.env.WHATSAPP_ACCESS_TOKEN
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID

  if (!token || !wabaId) {
    return NextResponse.json({
      error: 'WHATSAPP_BUSINESS_ACCOUNT_ID no está configurado en el entorno',
      templates: [],
    })
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=200`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({
        error: data?.error?.message || `Error HTTP ${res.status} al consultar plantillas en Meta`,
        templates: [],
      })
    }

    const templates: WhatsAppTemplateDef[] = (data.data ?? [])
      .filter((t: any) => t.status === 'APPROVED')
      .map((t: any) => {
        const components = t.components ?? []
        const header = components.find((c: any) => c.type === 'HEADER')
        const body   = components.find((c: any) => c.type === 'BODY')
        const footer = components.find((c: any) => c.type === 'FOOTER')
        const button = components.find((c: any) => c.type === 'BUTTONS')?.buttons?.[0]
        return {
          name: t.name,
          language: t.language,
          label: `${t.name.replace(/_/g, ' ')} (${t.language})`,
          hasImageHeader: header?.format === 'IMAGE',
          bodyPreview: body?.text ?? '',
          footer: footer?.text,
          buttonLabel: button?.text,
        }
      })

    return NextResponse.json({ templates })
  } catch (e: any) {
    return NextResponse.json({
      error: e?.message || 'Error de red al consultar plantillas en Meta',
      templates: [],
    })
  }
}
