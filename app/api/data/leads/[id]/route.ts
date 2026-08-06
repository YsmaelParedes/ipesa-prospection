import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'

// Allowed fields for lead updates — must match DB columns exactly
const ALLOWED_LEAD_UPDATE_FIELDS = [
  'name', 'email', 'phone',
  'canal', 'segmento', 'estado',
  'monto', 'notas', 'fecha',
  'contact_id',
] as const

function pickLeadUpdateFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_LEAD_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

// PATCH /api/data/leads/[id] — solo puede editar sus propios leads (o legacy sin user_id)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getUserContext()
    if (!ctx) return unauthorizedResponse()
    const { uid, role } = ctx

    const { id }    = await params
    const body      = await req.json()
    const updates   = pickLeadUpdateFields(body)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron campos válidos para actualizar' }, { status: 400 })
    }
    if (updates.name !== undefined && (typeof updates.name !== 'string' || (updates.name as string).trim().length === 0)) {
      return NextResponse.json({ error: 'name no puede estar vacío' }, { status: 400 })
    }
    if (updates.notas && typeof updates.notas === 'string' && (updates.notas as string).length > 5000) {
      return NextResponse.json({ error: 'notas excede 5000 caracteres' }, { status: 400 })
    }

    const supabase  = getServerSupabase()

    // Verifica propiedad antes de actualizar
    const { data: existing } = await supabase
      .from('leads')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }
    // Permite editar si es del usuario, es un lead legacy (user_id NULL), o el usuario es admin
    if (role !== 'admin' && existing.user_id && existing.user_id !== uid) {
      return NextResponse.json({ error: 'Sin permisos para editar este lead' }, { status: 403 })
    }

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

// DELETE /api/data/leads/[id] — solo puede borrar sus propios leads
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getUserContext()
    if (!ctx) return unauthorizedResponse()
    const { uid, role } = ctx

    const { id }   = await params
    const supabase = getServerSupabase()

    // Verifica propiedad
    const { data: existing } = await supabase
      .from('leads')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }
    if (role !== 'admin' && existing.user_id && existing.user_id !== uid) {
      return NextResponse.json({ error: 'Sin permisos para eliminar este lead' }, { status: 403 })
    }

    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/data/leads/[id]]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al eliminar lead' }, { status: 500 })
  }
}
