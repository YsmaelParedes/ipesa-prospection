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
  // Twilio puede devolver: 'approved', 'APPROVED', 'Approved', 'pending', 'rejected', 'paused'
  if (s === 'approved')  return 'approved'
  if (s === 'pending')   return 'pending'
  if (s === 'rejected')  return 'rejected'
  if (s === 'paused')    return 'paused'
  return s
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

    // Traer hasta 200 plantillas (Twilio máximo por página)
    const contents = await fetchPage(
      'https://content.twilio.com/v1/ContentAndApprovals?PageSize=200',
      headers,
    )

    const templates = contents.map((t: any) => {
      // El estado puede estar en distintas rutas según versión de Twilio
      const rawStatus =
        t.approvals?.whatsapp?.status ??
        t.approval_requests?.whatsapp?.status ??
        t.whatsapp_approval_status ??
        null

      return {
        sid:           t.sid,
        friendly_name: t.friendly_name,
        language:      t.language,
        variables:     t.variables || {},
        body:          extractBody(t.types || {}),
        status:        normalizeStatus(rawStatus),
      }
    })

    return NextResponse.json({ templates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
