import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// ── Mapeos BD ↔ app ────────────────────────────────────────────────────────
function toApp(r: any) {
  if (!r) return r
  const { reminder_date, ...rest } = r
  return { ...rest, fecha_recordatorio: reminder_date ?? r.fecha_recordatorio }
}

function toDB(body: any) {
  const { fecha_recordatorio, ...rest } = body
  return { ...rest, ...(fecha_recordatorio !== undefined ? { reminder_date: fecha_recordatorio } : {}) }
}

// GET /api/data/reminders — solo los del usuario autenticado
export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()
    const leadId   = req.nextUrl.searchParams.get('lead_id')

    let q = supabase
      .from('reminders')
      .select('*')
      .or(`user_id.eq.${uid},user_id.is.null`)
      .order('reminder_date', { ascending: true })

    if (leadId) q = q.eq('lead_id', leadId)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ reminders: (data ?? []).map(toApp) })
  } catch (error: any) {
    console.error('[GET /api/data/reminders]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al obtener recordatorios' }, { status: 500 })
  }
}

// POST /api/data/reminders — crea recordatorio vinculado al usuario autenticado
export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const body     = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('reminders')
      .insert([{ ...toDB(body), user_id: uid }])
      .select()

    if (error) throw error
    return NextResponse.json(toApp(data?.[0]) ?? {})
  } catch (error: any) {
    console.error('[POST /api/data/reminders]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al crear recordatorio' }, { status: 500 })
  }
}
