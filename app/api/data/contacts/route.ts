import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// Allowed fields for contact creation/update — prevents mass assignment
const ALLOWED_CONTACT_FIELDS = [
  'name', 'email', 'phone', 'company', 'segment',
  'acquisition_channel', 'notes', 'address', 'city',
] as const

function pickContactFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_CONTACT_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

function validateContactPost(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return 'El campo name es requerido'
  }
  if (body.name.length > 200) return 'name excede 200 caracteres'
  if (body.email && typeof body.email === 'string' && body.email.length > 254) return 'email excede 254 caracteres'
  if (body.phone && typeof body.phone === 'string' && body.phone.length > 30) return 'phone excede 30 caracteres'
  if (body.notes && typeof body.notes === 'string' && body.notes.length > 2000) return 'notes excede 2000 caracteres'
  return null
}

export async function GET() {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ contacts: data })
  } catch (error: any) {
    console.error('[GET /api/data/contacts]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener contactos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const body = await req.json()
    const validationError = validateContactPost(body)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const contact = pickContactFields(body)
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .insert([contact])
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al crear contacto' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids debe ser un array no vacío' }, { status: 400 })
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Se permite eliminar máximo 100 contactos a la vez' }, { status: 400 })
    }
    // Validate each id is a string (UUID format)
    if (ids.some(id => typeof id !== 'string' || id.length > 40)) {
      return NextResponse.json({ error: 'ids inválidos' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('contacts')
      .delete()
      .in('id', ids)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al eliminar contactos' }, { status: 500 })
  }
}
