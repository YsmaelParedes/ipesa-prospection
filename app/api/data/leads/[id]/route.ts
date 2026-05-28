import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// PATCH /api/data/leads/[id] — solo puede editar sus propios leads (o legacy sin user_id)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id }    = await params
    const updates   = await req.json()
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
    // Permite editar si es del usuario o es un lead legacy (user_id NULL)
    if (existing.user_id && existing.user_id !== uid) {
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
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

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
    if (existing.user_id && existing.user_id !== uid) {
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
