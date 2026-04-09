import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    const cut = endOfToday.toISOString()

    const [r1, r2] = await Promise.all([
      supabase.from('reminders').select('id', { count: 'exact', head: true })
        .eq('is_completed', false).lte('reminder_date', cut),
      supabase.from('contact_follow_ups').select('id', { count: 'exact', head: true })
        .eq('status', 'pending').lte('scheduled_date', cut),
    ])

    return NextResponse.json({ count: (r1.count ?? 0) + (r2.count ?? 0) })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
