import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const type = req.nextUrl.searchParams.get('type')
    let q = supabase.from('app_config').select('*').order('label', { ascending: true })
    if (type) q = q.eq('type', type)
    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al obtener config' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('app_config')
      .insert([{ type: body.type, label: body.label }])
      .select()
    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al crear item' }, { status: 500 })
  }
}
