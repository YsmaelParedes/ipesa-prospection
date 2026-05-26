import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getAuthClient } from '@/lib/supabase-server'

function toDB(body: any) {
  const { fecha_recordatorio, ...rest } = body
  return { ...rest, ...(fecha_recordatorio !== undefined ? { reminder_date: fecha_recordatorio } : {}) }
}

async function getUser() {
  const client = await getAuthClient()
  const { data: { user } } = await client.auth.getUser()
  return user
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const updates = toDB(await req.json())
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('reminders')
      .update({ ...updates, ...(updates.completado ? { completado_at: new Date().toISOString() } : {}) })
      .eq('id', id)
      .eq('user_id', user.id)   // solo puede editar sus propios recordatorios
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
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)   // solo puede borrar sus propios recordatorios
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar recordatorio' }, { status: 500 })
  }
}
