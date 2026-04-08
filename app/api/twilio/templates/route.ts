import { NextResponse } from 'next/server'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN

function extractBody(types: Record<string, any>): string {
  for (const key of Object.keys(types)) {
    const t = types[key]
    if (t?.body) return t.body
    if (t?.message) return t.message
  }
  return ''
}

function normalizeStatus(raw: string | undefined | null): string {
  if (!raw) return 'unknown'
  const s = raw.trim().toLowerCase()
  if (s === 'approved')  return 'approved'
  if (s === 'pending')   return 'pending'
  if (s === 'rejected')  return 'rejected'
  if (s === 'paused')    return 'paused'
  return s
}

/**
 * Extrae el status de aprobación de WhatsApp desde cualquier estructura
 * que Twilio pueda devolver en su API ContentAndApprovals.
 */
function extractWhatsappStatus(t: any): string {
  // Estructura más común: t.approvals.whatsapp.status
  if (t.approvals?.whatsapp?.status)
    return normalizeStatus(t.approvals.whatsapp.status)

  // t.approvals.whatsapp es un string directo (no un objeto)
  if (typeof t.approvals?.whatsapp === 'string')
    return normalizeStatus(t.approvals.whatsapp)

  // t.approvals es un array de objetos con campo 'channel'
  if (Array.isArray(t.approvals)) {
    const wa = t.approvals.find((a: any) =>
      a.channel?.toLowerCase() === 'whatsapp' || a.name?.toLowerCase() === 'whatsapp'
    )
    if (wa?.status) return normalizeStatus(wa.status)
  }

  // t.approvals.status directo (sin sub-objeto por canal)
  if (t.approvals?.status)
    return normalizeStatus(t.approvals.status)

  // Versión más nueva de la API: approval_requests en vez de approvals
  if (t.approval_requests?.whatsapp?.status)
    return normalizeStatus(t.approval_requests.whatsapp.status)

  // Campo en la raíz del objeto template
  if (t.whatsapp_approval_status)
    return normalizeStatus(t.whatsapp_approval_status)

  return 'unknown'
}

async function fetchPage(url: string, headers: Record<string, string>): Promise<any[]> {
  const res  = await fetch(url, { headers, cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `Twilio Content API respondió ${res.status}`)
  return data.contents || []
}

export async function GET() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    return NextResponse.json(
      { error: 'TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no configuradas' },
      { status: 500 }
    )
  }

  try {
    const headers = {
      'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
    }

    const contents = await fetchPage(
      'https://content.twilio.com/v1/ContentAndApprovals?PageSize=200',
      headers,
    )

    const templates = contents.map((t: any) => {
      const status = extractWhatsappStatus(t)
      console.log(`[templates] "${t.friendly_name}" | approvals=${JSON.stringify(t.approvals)} → status="${status}"`)

      return {
        sid:           t.sid,
        friendly_name: t.friendly_name,
        language:      t.language,
        variables:     t.variables || {},
        body:          extractBody(t.types || {}),
        status,
      }
    })

    return NextResponse.json({ templates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
