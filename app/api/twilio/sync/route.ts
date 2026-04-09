import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN!

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Estados que aún pueden cambiar (no finales)
const PENDING_STATUSES = ['queued', 'accepted', 'sending', 'sent']

export async function POST() {
  try {
    const supabase = getSupabase()

    // Obtener mensajes con estado no final
    const { data: pending, error } = await supabase
      .from('message_logs')
      .select('id, message_sid, status')
      .in('status', PENDING_STATUSES)
      .order('sent_at', { ascending: false })
      .limit(100)

    if (error) throw error
    if (!pending || pending.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No hay mensajes pendientes' })
    }

    const auth = 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')
    let updated = 0

    for (const msg of pending) {
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages/${msg.message_sid}.json`,
          { headers: { Authorization: auth } }
        )
        if (!res.ok) continue

        const data = await res.json()
        const newStatus = data.status as string
        if (!newStatus || newStatus === msg.status) continue

        const now = new Date().toISOString()
        const patch: Record<string, any> = { status: newStatus, updated_at: now }

        if (newStatus === 'delivered') patch.delivered_at = now
        if (newStatus === 'read') {
          patch.delivered_at = now
          patch.read_at = now
        }
        if (data.error_code)    patch.error_code    = String(data.error_code)
        if (data.error_message) patch.error_message = data.error_message

        await supabase.from('message_logs').update(patch).eq('id', msg.id)
        updated++
      } catch {
        // continuar con el siguiente
      }
    }

    return NextResponse.json({ updated, total: pending.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
