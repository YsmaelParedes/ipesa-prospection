import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { verifySession } from '@/lib/auth'

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN!
const FROM         = process.env.TWILIO_WHATSAPP_FROM!
const MESSAGING_SID = process.env.TWILIO_MESSAGING_SERVICE_SID
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL || ''

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length === 12) return `whatsapp:+${digits}`
  if (digits.length === 10) return `whatsapp:+52${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `whatsapp:+52${digits.slice(1)}`
  return `whatsapp:+${digits}`
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    if (!verifySession(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { phone, contentSid, contentVariables, contactId, contactName, templateName, scheduledFor } = await req.json()

    if (!phone)       return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })
    if (!contentSid)  return NextResponse.json({ error: 'ContentSid requerido' }, { status: 400 })
    if (!ACCOUNT_SID) return NextResponse.json({ error: 'TWILIO_ACCOUNT_SID no configurada' }, { status: 500 })
    if (!AUTH_TOKEN)  return NextResponse.json({ error: 'TWILIO_AUTH_TOKEN no configurada' }, { status: 500 })
    if (!FROM && !MESSAGING_SID) return NextResponse.json({ error: 'TWILIO_WHATSAPP_FROM no configurada' }, { status: 500 })

    // Validate phone format
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      return NextResponse.json({ error: 'Teléfono inválido: debe tener al menos 10 dígitos' }, { status: 400 })
    }

    const to = formatPhone(phone)
    const isScheduled = !!scheduledFor

    if (isScheduled && !MESSAGING_SID) {
      return NextResponse.json(
        { error: 'Para programar envíos se requiere TWILIO_MESSAGING_SERVICE_SID' },
        { status: 400 }
      )
    }

    const params = new URLSearchParams({ To: to, ContentSid: contentSid })

    if (isScheduled) {
      params.append('MessagingServiceSid', MESSAGING_SID!)
      params.append('ScheduleType', 'fixed')
      params.append('SendAt', new Date(scheduledFor).toISOString())
    } else {
      params.append('From', FROM)
    }

    if (contentVariables && Object.keys(contentVariables).length > 0) {
      params.append('ContentVariables', JSON.stringify(contentVariables))
    }

    if (APP_URL) {
      params.append('StatusCallback', `${APP_URL}/api/twilio/webhook`)
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
        },
        body: params.toString(),
      }
    )

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || 'Error Twilio', detail: data },
        { status: res.status }
      )
    }

    // Save log in Supabase with service role key
    const supabase = getServerSupabase()
    await supabase.from('message_logs').insert({
      message_sid:   data.sid,
      contact_id:    contactId   || null,
      contact_name:  contactName || '',
      contact_phone: phone,
      template_sid:  contentSid,
      template_name: templateName || '',
      status:        isScheduled ? 'scheduled' : (data.status || 'queued'),
      scheduled_for: scheduledFor || null,
    })

    return NextResponse.json({ success: true, messageId: data.sid })
  } catch (error: any) {
    console.error('Twilio send error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
