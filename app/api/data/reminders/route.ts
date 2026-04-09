import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const pending = searchParams.get('pending')

    const supabase = getServerSupabase()
    let query = supabase
      .from('reminders')
      .select('*, contacts(name, phone, company), campaigns(name)')
      .order('reminder_date', { ascending: true })

    if (pending === 'true') {
      query = query
        .eq('is_completed', false)
        .lte('reminder_date', new Date().toISOString())
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ reminders: data })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener recordatorios' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const reminder = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('reminders')
      .insert([reminder])
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al crear recordatorio' }, { status: 500 })
  }
}
