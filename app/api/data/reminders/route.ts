import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

// ── El campo en la BD se llama reminder_date.
// ── El resto de la app usa fecha_recordatorio.
// ── Este archivo hace el mapeo en ambas direcciones.

function toApp(r: any) {
  if (!r) return r
  const { reminder_date, ...rest } = r
  return { ...rest, fecha_recordatorio: reminder_date ?? r.fecha_recordatorio }
}

function toDB(body: any) {
  const { fecha_recordatorio, ...rest } = body
  return { ...rest, ...(fecha_recordatorio !== undefined ? { reminder_date: fecha_recordatorio } : {}) }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const leadId = req.nextUrl.searchParams.get('lead_id')

    let q = supabase
      .from('reminders')
      .select('*')
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('reminders')
      .insert([toDB(body)])
      .select()
    if (error) throw error
    return NextResponse.json(toApp(data?.[0]) ?? {})
  } catch (error: any) {
    console.error('[POST /api/data/reminders]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Error al crear recordatorio' }, { status: 500 })
  }
}
