import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { REMINDER_SCHEMA, reminderToApp, reminderToDB } from '@/lib/reminders'
import { getAccessibleLead } from '@/lib/leads'

// GET /api/data/reminders[?lead_id=uuid] — los del usuario en la tienda activa
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (leadId && !isUUID(leadId)) return jsonError('lead_id inválido')

  let q = getServerSupabase()
    .from('reminders')
    .select('id, lead_id, lead_name, nota, reminder_date, completado, completado_at, created_at, type, priority')
    .eq('user_id', ctx.uid)
    .eq('store_id', ctx.storeId)
    .order('reminder_date', { ascending: true })
  if (leadId) q = q.eq('lead_id', leadId)

  const { data, error } = await q
  if (error) return serverError('GET /api/data/reminders', error, 'Error al obtener recordatorios')
  return NextResponse.json({ reminders: (data ?? []).map(reminderToApp) })
}

// POST /api/data/reminders — crea recordatorio vinculado al usuario autenticado
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, REMINDER_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (!parsed.data.fecha_recordatorio) return jsonError('fecha_recordatorio es requerida')

  // Solo se puede ligar a un lead visible para el usuario
  if (parsed.data.lead_id && !(await getAccessibleLead(ctx, parsed.data.lead_id as string))) {
    return jsonError('Lead no encontrado', 404)
  }

  const { data, error } = await getServerSupabase()
    .from('reminders')
    .insert([{ ...reminderToDB(parsed.data), user_id: ctx.uid, store_id: ctx.storeId }])
    .select()
  if (error) return serverError('POST /api/data/reminders', error, 'Error al crear recordatorio')
  return NextResponse.json(data?.[0] ? reminderToApp(data[0]) : {})
}
