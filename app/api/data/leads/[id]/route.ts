import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const updates = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    console.error('[PATCH /api/data/leads/[id]]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al actualizar lead' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/data/leads/[id]]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar lead' }, { status: 500 })
  }
}
