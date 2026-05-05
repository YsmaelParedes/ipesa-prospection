import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const { count } = await supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('is_completed', false)
      .lte('reminder_date', endOfToday.toISOString())

    return NextResponse.json({ count: count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
