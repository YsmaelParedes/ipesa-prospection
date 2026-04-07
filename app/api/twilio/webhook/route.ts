import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)

    const messageSid     = params.get('MessageSid')     || params.get('SmsSid')
    const messageStatus  = params.get('MessageStatus')  || params.get('SmsStatus')
    const errorCode      = params.get('ErrorCode')
    const errorMessage   = params.get('ErrorMessage')
    const eventType      = params.get('EventType')      // "READ" para WhatsApp read receipts

    if (!messageSid) return new NextResponse('OK', { status: 200 })

    const supabase = getSupabase()
    const now = new Date().toISOString()

    const updates: Record<string, any> = {
      status:     messageStatus || 'unknown',
      updated_at: now,
    }

    if (errorCode)   updates.error_code    = errorCode
    if (errorMessage) updates.error_message = errorMessage

    if (messageStatus === 'delivered') updates.delivered_at = now
    if (messageStatus === 'read' || eventType === 'READ') {
      updates.status   = 'read'
      updates.read_at  = now
      if (!updates.delivered_at) updates.delivered_at = now
    }

    await supabase
      .from('message_logs')
      .update(updates)
      .eq('message_sid', messageSid)

    return new NextResponse('OK', { status: 200 })
  } catch {
    return new NextResponse('OK', { status: 200 }) // Siempre 200 para Twilio
  }
}
