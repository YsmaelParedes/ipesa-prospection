import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

function toDB(body: any) {
  const { fecha_recordatorio, ...rest } = body
  return { ...rest, ...(fecha_recordatorio !== undefined ? { reminder_date: fecha_recordatorio } : {}) }
}

// PATCH /api/data/reminders/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id }   = await params
    const updates  = toDB(await req.json())
    const supabase = getServerSupabase()

    // Verifica propiedad (permite legacy user_id NULL)
    const { data: existing } = await supabase
      .from('reminders')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    if (existing.user_id && existing.user_id !== uid) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('reminders')
      .update({
        ...updates,
        ...(updates.completado ? { completado_at: new Date().toISOString() } : {}),
      })
      .eq('id', id)
      .select()

    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    console.error('[PATCH /api/data/reminders/[id]]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al actualizar recordatorio' }, { status: 500 })
  }
}

// DELETE /api/data/reminders/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id }   = await params
    const supabase = getServerSupabase()

    // Verifica propiedad
    const { data: existing } = await supabase
      .from('reminders')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    if (existing.user_id && existing.user_id !== uid) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar recordatorio' }, { status: 500 })
  }
}
