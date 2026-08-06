import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// GET /api/data/activities?lead_id=xxx
export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()
    const leadId   = req.nextUrl.searchParams.get('lead_id')

    let q = supabase
      .from('lead_activities')
      .select('*')
      .order('activity_date', { ascending: false })

    if (leadId) {
      // Para un lead específico: traer todas las actividades del lead
      q = q.eq('lead_id', leadId)
    } else {
      // Sin lead: traer las del usuario actual
      q = q.or(`user_id.eq.${uid},user_id.is.null`)
    }

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ activities: data ?? [] })
  } catch (error: any) {
    console.error('[GET /api/data/activities]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al obtener actividades' }, { status: 500 })
  }
}

// Allowed fields for activity creation — must match DB columns exactly
// DB: id, lead_id, user_id, type, description, amount, activity_date, created_at
const ALLOWED_ACTIVITY_FIELDS = [
  'type', 'description', 'amount', 'activity_date', 'lead_id',
] as const

function pickActivityFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of ALLOWED_ACTIVITY_FIELDS) {
    if (key in body) out[key] = body[key]
  }
  return out
}

// POST /api/data/activities
export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const body = await req.json()

    if (!body.type || typeof body.type !== 'string' || body.type.trim().length === 0) {
      return NextResponse.json({ error: 'type es requerido' }, { status: 400 })
    }
    if (body.type.length > 100) {
      return NextResponse.json({ error: 'type excede 100 caracteres' }, { status: 400 })
    }
    if (body.description && typeof body.description === 'string' && body.description.length > 2000) {
      return NextResponse.json({ error: 'description excede 2000 caracteres' }, { status: 400 })
    }
    if (body.amount !== undefined && body.amount !== null) {
      const v = Number(body.amount)
      if (isNaN(v) || v < 0 || v > 1_000_000_000) {
        return NextResponse.json({ error: 'amount inválido' }, { status: 400 })
      }
    }

    const activityData = pickActivityFields(body)
    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('lead_activities')
      .insert([{ ...activityData, user_id: uid }])
      .select()

    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    console.error('[POST /api/data/activities]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al crear actividad' }, { status: 500 })
  }
}
