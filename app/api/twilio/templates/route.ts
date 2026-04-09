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

function extractApprovalStatus(t: any): string {
  // Twilio uses 'approval_requests' (flat object with .status)
  const s = t.approval_requests?.status || t.approvals?.whatsapp?.status
  return s ? s.toLowerCase() : 'unknown'
}

export async function GET() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    return NextResponse.json(
      { error: 'TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no configuradas' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch('https://content.twilio.com/v1/ContentAndApprovals?PageSize=50', {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
      },
      cache: 'no-store',
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.message || `Twilio Content API respondió ${res.status}`)

    const templates = (data.contents || []).map((t: any) => ({
      sid:           t.sid,
      friendly_name: t.friendly_name,
      language:      t.language,
      variables:     t.variables || {},
      body:          extractBody(t.types || {}),
      status:        extractApprovalStatus(t),
    }))

    return NextResponse.json({ templates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
