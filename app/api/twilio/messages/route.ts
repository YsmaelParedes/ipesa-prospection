import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status     = searchParams.get('status')
    const contactId  = searchParams.get('contact_id')
    const from       = searchParams.get('from')
    const to         = searchParams.get('to')

    const supabase = getServerSupabase()
    let query = supabase
      .from('message_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(500)

    if (status)    query = query.eq('status', status)
    if (contactId) query = query.eq('contact_id', contactId)
    if (from)      query = query.gte('sent_at', from)
    if (to)        query = query.lte('sent_at', to)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ messages: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
