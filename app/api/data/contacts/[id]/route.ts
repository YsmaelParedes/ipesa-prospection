import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// Allowed fields for contact updates — prevents mass assignment
const ALLOWED_UPDATE_FIELDS = [
  'name', 'email', 'phone', 'company', 'segment',
  'acquisition_channel', 'notes', 'address', 'city',
] as const

function pickUpdateFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id } = await params
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener contacto' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id } = await params
    const body = await req.json()

    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
      return NextResponse.json({ error: 'name no puede estar vacío' }, { status: 400 })
    }
    if (body.name && body.name.length > 200) return NextResponse.json({ error: 'name excede 200 caracteres' }, { status: 400 })
    if (body.notes && typeof body.notes === 'string' && body.notes.length > 2000) {
      return NextResponse.json({ error: 'notes excede 2000 caracteres' }, { status: 400 })
    }

    const updates = pickUpdateFields(body)
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', id)
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[PUT /api/data/contacts/[id]]', error?.message ?? error)
    if (error?.code === '23505') {
      const field = error.message?.includes('phone') ? 'número de teléfono' : error.message?.includes('email') ? 'correo' : 'dato'
      return NextResponse.json({ error: `Ya existe un contacto con este ${field}` }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error al actualizar contacto' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { id } = await params
    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al eliminar contacto' }, { status: 500 })
  }
}
