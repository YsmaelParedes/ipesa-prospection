import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

// Mapeo fecha_recordatorio (app) → reminder_date (BD)
function toDB(body: any) {
  const { fecha_recordatorio, ...rest } = body
  return { ...rest, ...(fecha_recordatorio !== undefined ? { reminder_date: fecha_recordatorio } : {}) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const updates = toDB(await req.json())
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('reminders')
      .update({ ...updates, ...(updates.completado ? { completado_at: new Date().toISOString() } : {}) })
      .eq('id', id)
      .select()
    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    console.error('[PATCH /api/data/reminders/[id]]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al actualizar recordatorio' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getServerSupabase()
    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar recordatorio' }, { status: 500 })
  }
}
