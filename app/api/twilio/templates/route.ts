import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

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

export async function GET(req: NextRequest) {
  // Auth check
  if (!verifySession(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

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
      status:        t.approvals?.whatsapp?.status || 'unknown',
    }))

    return NextResponse.json({ templates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
