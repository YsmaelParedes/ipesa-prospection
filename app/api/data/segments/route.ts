import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('segments')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ segments: data })
  } catch (error: any) {
    console.error('[GET /api/data/segments]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al obtener segmentos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description, color } = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('segments')
      .insert([{ name, description, color }])
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al crear segmento' }, { status: 500 })
  }
}
