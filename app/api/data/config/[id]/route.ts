import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id } = await params
    const supabase = getServerSupabase()
    const { error } = await supabase.from('app_config').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}
