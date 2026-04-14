import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const channel = req.nextUrl.searchParams.get('channel')
    const supabase = getServerSupabase()
    let query = supabase.from('templates').select('*').order('created_at', { ascending: false })
    if (channel) query = query.eq('channel', channel)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ templates: data })
  } catch (error: any) {
    console.error('[GET /api/data/templates]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al obtener plantillas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { channel, name, body } = await req.json()
    if (!channel || !name || !body) {
      return NextResponse.json({ error: 'channel, name y body son requeridos' }, { status: 400 })
    }
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('templates')
      .insert([{ channel, name, content: body }])
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[POST /api/data/templates]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al crear plantilla' }, { status: 500 })
  }
}
