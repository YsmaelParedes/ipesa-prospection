import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ contacts: data })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener contactos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const contact = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .insert([contact])
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al crear contacto' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json()
    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('contacts')
      .delete()
      .in('id', ids)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al eliminar contactos' }, { status: 500 })
  }
}
