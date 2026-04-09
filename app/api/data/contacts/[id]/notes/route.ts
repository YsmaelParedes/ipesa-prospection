import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener notas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { noteType, content } = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contact_notes')
      .insert([{ contact_id: id, note_type: noteType, content, created_by: 'admin' }])
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al agregar nota' }, { status: 500 })
  }
}
