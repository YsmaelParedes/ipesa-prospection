import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { verifyTwilioSignature } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()

    // Validate Twilio signature if auth token is configured
    if (process.env.TWILIO_AUTH_TOKEN) {
      const isValid = verifyTwilioSignature(req, body)
      if (!isValid) {
        console.warn('Invalid Twilio webhook signature')
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    const params = new URLSearchParams(body)

    const messageSid     = params.get('MessageSid')     || params.get('SmsSid')
    const messageStatus  = params.get('MessageStatus')  || params.get('SmsStatus')
    const errorCode      = params.get('ErrorCode')
    const errorMessage   = params.get('ErrorMessage')
    const eventType      = params.get('EventType')

    if (!messageSid) return new NextResponse('OK', { status: 200 })

    const supabase = getServerSupabase()
    const now = new Date().toISOString()

    const updates: Record<string, any> = {
      status:     messageStatus || 'unknown',
      updated_at: now,
    }

    if (errorCode)    updates.error_code    = errorCode
    if (errorMessage) updates.error_message = errorMessage

    if (messageStatus === 'delivered') updates.delivered_at = now
    if (messageStatus === 'read' || eventType === 'READ') {
      updates.status   = 'read'
      updates.read_at  = now
      if (!updates.delivered_at) updates.delivered_at = now
    }

    const { error } = await supabase
      .from('message_logs')
      .update(updates)
      .eq('message_sid', messageSid)

    if (error) {
      console.error('Webhook DB update failed:', error.message)
    }

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new NextResponse('OK', { status: 200 }) // Always 200 for Twilio
  }
}
