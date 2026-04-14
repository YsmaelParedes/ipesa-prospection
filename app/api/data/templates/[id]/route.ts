import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { name, body } = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('templates')
      .update({ name, content: body })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[PUT /api/data/templates/:id]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al actualizar plantilla' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getServerSupabase()
    const { error } = await supabase.from('templates').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/data/templates/:id]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar plantilla' }, { status: 500 })
  }
}
