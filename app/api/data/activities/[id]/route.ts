import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// DELETE /api/data/activities/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id }   = await params
    const supabase = getServerSupabase()

    const { data: existing } = await supabase
      .from('lead_activities')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing)
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (existing.user_id && existing.user_id !== uid)
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { error } = await supabase.from('lead_activities').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar' }, { status: 500 })
  }
}

// Allowed fields for activity updates — must match DB columns exactly
const ALLOWED_ACTIVITY_UPDATE_FIELDS = [
  'type', 'description', 'amount', 'activity_date',
] as const

function pickActivityUpdateFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_ACTIVITY_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

// PATCH /api/data/activities/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id }   = await params
    const body     = await req.json()
    const updates  = pickActivityUpdateFields(body)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron campos válidos para actualizar' }, { status: 400 })
    }
    if (updates.description && typeof updates.description === 'string' && (updates.description as string).length > 2000) {
      return NextResponse.json({ error: 'description excede 2000 caracteres' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data: existing } = await supabase
      .from('lead_activities')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing)
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (existing.user_id && existing.user_id !== uid)
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const { data, error } = await supabase
      .from('lead_activities')
      .update(updates)
      .eq('id', id)
      .select()

    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Error al actualizar' }, { status: 500 })
  }
}
