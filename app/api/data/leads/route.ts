import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ leads: data })
  } catch (error: any) {
    console.error('[GET /api/data/leads]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al obtener leads' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const lead = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .insert([lead])
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[POST /api/data/leads]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al crear lead' }, { status: 500 })
  }
}
