import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contact_follow_ups')
      .select('*, follow_up_stages(stage_name, objective, day, tone, channel)')
      .eq('contact_id', id)
      .order('scheduled_date', { ascending: true })
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener follow-ups' }, { status: 500 })
  }
}
