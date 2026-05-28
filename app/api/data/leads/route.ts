import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// GET /api/data/leads — solo los leads del usuario autenticado
// Incluye registros legacy (user_id IS NULL) para retrocompatibilidad pre-migración
export async function GET() {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .or(`user_id.eq.${uid},user_id.is.null`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ leads: data })
  } catch (error: any) {
    console.error('[GET /api/data/leads]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al obtener leads' }, { status: 500 })
  }
}

// POST /api/data/leads — crea lead vinculado al usuario autenticado
export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const body = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .insert([{ ...body, user_id: uid }])
      .select()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[POST /api/data/leads]', error?.message ?? error)
    return NextResponse.json({ error: error?.message ?? 'Error al crear lead' }, { status: 500 })
  }
}
