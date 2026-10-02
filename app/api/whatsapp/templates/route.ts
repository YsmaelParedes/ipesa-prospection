import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { GRAPH_VERSION, countTemplateVariables } from '@/lib/whatsapp'
import type { WhatsAppTemplateDef } from '@/lib/whatsappTemplates'

// Las plantillas cambian poco: se cachean 5 min por instancia para no
// consultar Meta cada vez que alguien abre un selector.
let cache: { at: number; templates: WhatsAppTemplateDef[] } | null = null
const TTL = 5 * 60 * 1000

function toDef(t: any): WhatsAppTemplateDef {
  const components = t.components ?? []
  const header  = components.find((c: any) => c.type === 'HEADER')
  const body    = components.find((c: any) => c.type === 'BODY')
  const footer  = components.find((c: any) => c.type === 'FOOTER')
  const buttons = components.find((c: any) => c.type === 'BUTTONS')?.buttons ?? []
  const bodyText: string = body?.text ?? ''

  // Casos que la app aún no sabe llenar: mejor avisarlo que dejar que Meta
  // rechace cada envío con "Number of parameters does not match".
  let unsupported: string | undefined
  if (header?.format === 'TEXT' && countTemplateVariables(header.text ?? '') > 0) unsupported = 'Tiene variables en el encabezado'
  else if (header?.format && !['TEXT', 'IMAGE'].includes(header.format)) unsupported = `Encabezado de tipo ${String(header.format).toLowerCase()}`
  else if (buttons.some((b: any) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url ?? ''))) unsupported = 'Tiene un botón con URL variable'
  else if (buttons.some((b: any) => b.type === 'COPY_CODE' || b.type === 'OTP')) unsupported = 'Tiene un botón de código'

  return {
    name: t.name,
    language: t.language,
    label: `${String(t.name).replace(/_/g, ' ')} (${t.language})`,
    category: t.category,
    hasImageHeader: header?.format === 'IMAGE',
    bodyPreview: bodyText,
    variableCount: countTemplateVariables(bodyText),
    footer: footer?.text,
    buttonLabel: buttons[0]?.text,
    unsupported,
  }
}

/**
 * GET /api/whatsapp/templates — plantillas APROBADAS consultadas en vivo a
 * Meta. Responde 200 con `error` (y templates: []) si falla, para que el
 * cliente caiga al catálogo local sin romper la UI.
 */
export async function GET() {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  if (cache && Date.now() - cache.at < TTL) return NextResponse.json({ templates: cache.templates })

  const token  = process.env.WHATSAPP_ACCESS_TOKEN
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  if (!token || !wabaId) {
    return NextResponse.json({ error: 'WHATSAPP_BUSINESS_ACCOUNT_ID no está configurado en el entorno', templates: [] })
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,language,category,components&limit=200`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[GET /api/whatsapp/templates]', data?.error?.message ?? res.status)
      return NextResponse.json({ error: `Meta respondió con error ${res.status} al consultar plantillas`, templates: [] })
    }

    const templates = (data.data ?? []).filter((t: any) => t.status === 'APPROVED').map(toDef)
    cache = { at: Date.now(), templates }
    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ error: 'Error de red al consultar plantillas en Meta', templates: [] })
  }
}
