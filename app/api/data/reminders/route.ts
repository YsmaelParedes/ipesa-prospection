import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { REMINDER_SCHEMA, reminderToApp, reminderToDB } from '@/lib/reminders'
import { getAccessibleLead } from '@/lib/leads'
import { naiveIso, zonedIso } from '@/lib/datetime'
import { fetchPaged } from '@/lib/paged'

const COLUMNS = 'id, user_id, lead_id, lead_name, nota, reminder_date, completado, completado_at, created_at, type, priority'

/** GET /api/data/reminders — la agenda personal del usuario en la tienda activa. */
async function GETImpl() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  try {
    const data = await fetchPaged<any>((from, to) => getServerSupabase()
      .from('reminders')
      .select(COLUMNS)
      .eq('user_id', ctx.uid)
      .eq('store_id', ctx.storeId)
      .order('reminder_date', { ascending: true }).order('id', { ascending: true })
      .range(from, to), 100000)
    return NextResponse.json({ reminders: data.map(({ user_id: _uid, ...r }) => ({ ...reminderToApp(r), mine: true })) })
  } catch (error) {
    return serverError('GET /api/data/reminders', error, 'Error al obtener recordatorios')
  }
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

  // El aviso push sale a la hora del recordatorio. Si esa hora ya pasó al
  // capturarlo, no hay nada que avisar: quien lo guarda ya lo tiene a la vista.
  const pushSent = naiveIso(parsed.data.fecha_recordatorio) <= zonedIso(new Date(), ctx.store.timezone)

  const { data, error } = await getServerSupabase()
    .from('reminders')
    .insert([{ ...reminderToDB(parsed.data), user_id: ctx.uid, store_id: ctx.storeId, push_sent: pushSent }])
    .select()
  if (error) return serverError('POST /api/data/reminders', error, 'Error al crear recordatorio')
  return NextResponse.json(data?.[0] ? reminderToApp(data[0]) : {})
}

export const GET = withServerTiming(GETImpl)
