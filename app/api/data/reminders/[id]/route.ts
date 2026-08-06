import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

function toDB(body: any) {
  const { fecha_recordatorio, ...rest } = body
  return { ...rest, ...(fecha_recordatorio !== undefined ? { reminder_date: fecha_recordatorio } : {}) }
}

// Allowed fields for reminder updates — prevents mass assignment
const ALLOWED_REMINDER_UPDATE_FIELDS = [
  'nota', 'lead_id', 'lead_name', 'completado',
  'fecha_recordatorio', 'reminder_date',
  'type', 'priority',
] as const

function pickReminderUpdateFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_REMINDER_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

// PATCH /api/data/reminders/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id }   = await params
    const rawBody  = await req.json()
    const pickedBody = pickReminderUpdateFields(rawBody)
    const updates  = toDB(pickedBody)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron campos válidos para actualizar' }, { status: 400 })
    }
    if (updates.nota && typeof updates.nota === 'string' && updates.nota.length > 1000) {
      return NextResponse.json({ error: 'nota excede 1000 caracteres' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Verifica propiedad (permite legacy user_id NULL)
    const { data: existing } = await supabase
      .from('reminders')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Recordatorio no encontrado' }, { status: 404 })
    if (existing.user_id !== uid) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    // Resetear push_sent si:
    //  a) se cambia la fecha a un valor futuro → notificar en el nuevo horario
    //  b) se vuelve a activar el recordatorio (completado → false)
    const newDate   = updates.reminder_date as string | undefined
    const resetPush =
      (newDate && new Date(newDate) > new Date()) ||
      updates.completado === false

    const { data, error } = await supabase
      .from('reminders')
      .update({
        ...updates,
        ...(updates.completado === true  ? { completado_at: new Date().toISOString() } : {}),
        ...(updates.completado === false ? { completado_at: null }                      : {}),
        ...(resetPush                   ? { push_sent: false }                          : {}),
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
    if (existing.user_id !== uid) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { error } = await supabase.from('reminders').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar recordatorio' }, { status: 500 })
  }
}
