import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const [
      { count: totalContacts },
      { count: pendingReminders },
      { count: newThisMonth },
      { data: reminders, error: remindersError },
      { data: contactsData },
      { data: segmentsData },
      { count: alertCount },
    ] = await Promise.all([
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('reminders').select('*', { count: 'exact', head: true }).eq('is_completed', false),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth.toISOString()),
      supabase.from('reminders')
        .select('*, contacts(name, phone, company)')
        .eq('is_completed', false)
        .order('reminder_date', { ascending: true })
        .limit(10),
      supabase.from('contacts').select('segment, acquisition_channel'),
      supabase.from('segments').select('name, color'),
      supabase.from('reminders').select('id', { count: 'exact', head: true })
        .eq('is_completed', false).lte('reminder_date', endOfToday.toISOString()),
    ])

    if (remindersError) throw remindersError

    // Segment breakdown
    const segmentCounts: Record<string, number> = {}
    let noSegment = 0
    for (const c of contactsData || []) {
      if (c.segment) segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1
      else noSegment++
    }
    const bySegment = [
      ...(segmentsData || [])
        .map((s: any) => ({ name: s.name, color: s.color, count: segmentCounts[s.name] || 0 }))
        .sort((a: any, b: any) => b.count - a.count),
      ...(noSegment > 0 ? [{ name: 'Sin segmento', color: '#9ca3af', count: noSegment }] : []),
    ]

    // Channel breakdown
    const channelCounts: Record<string, number> = {}
    for (const c of contactsData || []) {
      const ch = c.acquisition_channel || 'Sin canal'
      channelCounts[ch] = (channelCounts[ch] || 0) + 1
    }
    const byChannel = Object.entries(channelCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    return NextResponse.json({
      metrics: {
        totalContacts: totalContacts || 0,
        pendingReminders: pendingReminders || 0,
        newThisMonth: newThisMonth || 0,
      },
      reminders: reminders || [],
      alertCount: alertCount ?? 0,
      bySegment,
      byChannel,
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener métricas' }, { status: 500 })
  }
}
