import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'

// Allowed fields for lead creation — must match DB columns exactly
const ALLOWED_LEAD_FIELDS = [
  'name', 'email', 'phone',
  'canal', 'segmento', 'estado',
  'monto', 'notas', 'fecha',
  'contact_id',
] as const

function pickLeadFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_LEAD_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

function validateLeadPost(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return 'El campo name es requerido'
  }
  if (body.name.length > 200) return 'name excede 200 caracteres'
  if (body.email && typeof body.email === 'string' && body.email.length > 254) return 'email excede 254 caracteres'
  if (body.phone && typeof body.phone === 'string' && body.phone.length > 30) return 'phone excede 30 caracteres'
  if (body.notas && typeof body.notas === 'string' && body.notas.length > 5000) return 'notas excede 5000 caracteres'
  if (body.monto !== undefined && body.monto !== null) {
    const v = Number(body.monto)
    if (isNaN(v) || v < 0 || v > 1_000_000_000) return 'monto inválido'
  }
  return null
}

// GET /api/data/leads
// Empleado: solo sus leads (+ legacy sin user_id). Admin: todos los leads, con el nombre del vendedor.
export async function GET() {
  try {
    const ctx = await getUserContext()
    if (!ctx) return unauthorizedResponse()

    const supabase = getServerSupabase()

    if (ctx.role === 'admin') {
      const [{ data, error }, { data: usersData }] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.auth.admin.listUsers({ perPage: 200 }),
      ])
      if (error) throw error

      const nameByUid = new Map(
        (usersData?.users ?? []).map(u => [u.id, (u.user_metadata?.display_name as string)?.trim() || u.email || 'Usuario'])
      )
      const leads = (data ?? []).map(l => ({
        ...l,
        owner_name: l.user_id ? (nameByUid.get(l.user_id) ?? 'Usuario') : 'Sin asignar',
      }))
      return NextResponse.json({ leads })
    }

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .or(`user_id.eq.${ctx.uid},user_id.is.null`)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ leads: data })
  } catch (error: any) {
    console.error('[GET /api/data/leads]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener leads' }, { status: 500 })
  }
}

// POST /api/data/leads — crea lead vinculado al usuario autenticado
export async function POST(req: NextRequest) {
  try {
    const ctx = await getUserContext()
    if (!ctx) return unauthorizedResponse()
    const { uid } = ctx

    const body = await req.json()
    const validationError = validateLeadPost(body)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

    const leadData = pickLeadFields(body)
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .insert([{ ...leadData, user_id: uid }])
      .select()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[POST /api/data/leads]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al crear lead' }, { status: 500 })
  }
}
