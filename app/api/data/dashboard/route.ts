import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()

    const [
      { count: totalContacts },
      { count: pendingReminders },
      { data: campaignsData },
      { data: reminders, error: remindersError },
      alertCounts,
    ] = await Promise.all([
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('reminders').select('*', { count: 'exact', head: true }).eq('is_completed', false),
      supabase.from('campaigns').select('sent_count, total_contacts'),
      supabase.from('reminders')
        .select('*, contacts(name, phone, company), campaigns(name)')
        .order('reminder_date', { ascending: true }),
      // Alert count logic
      (async () => {
        const endOfToday = new Date()
        endOfToday.setHours(23, 59, 59, 999)
        const cut = endOfToday.toISOString()
        const [r1, r2] = await Promise.all([
          supabase.from('reminders').select('id', { count: 'exact', head: true })
            .eq('is_completed', false).lte('reminder_date', cut),
          supabase.from('contact_follow_ups').select('id', { count: 'exact', head: true })
            .eq('status', 'pending').lte('scheduled_date', cut),
        ])
        return (r1.count ?? 0) + (r2.count ?? 0)
      })(),
    ])

    if (remindersError) throw remindersError

    const totalSent = campaignsData?.reduce((sum: number, c: any) => sum + c.sent_count, 0) || 0

    return NextResponse.json({
      metrics: {
        totalContacts: totalContacts || 0,
        pendingReminders: pendingReminders || 0,
        totalMessagesSent: totalSent,
        conversionRate: totalContacts ? ((totalSent / totalContacts) * 100).toFixed(2) : 0,
      },
      reminders: reminders || [],
      alertCount: alertCounts,
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener métricas' }, { status: 500 })
  }
}
