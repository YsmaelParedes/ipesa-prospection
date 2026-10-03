import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { REMINDER_SCHEMA, reminderToApp, reminderToDB } from '@/lib/reminders'
import { getAccessibleLead } from '@/lib/leads'
import { naiveIso, zonedIso } from '@/lib/datetime'

const COLUMNS = 'id, user_id, lead_id, lead_name, nota, reminder_date, completado, completado_at, created_at, type, priority'

/**
 * GET /api/data/reminders — la agenda personal del usuario en la tienda activa.
 * GET /api/data/reminders?lead_id=uuid — todos los recordatorios de ese lead
 *   (de cualquier persona del equipo), si el usuario puede ver el lead: así la
 *   ficha muestra el mismo seguimiento que la lista. Solo su autor los edita.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (leadId && !isUUID(leadId)) return jsonError('lead_id inválido')

  if (leadId) {
    if (!(await getAccessibleLead(ctx, leadId))) return jsonError('Lead no encontrado', 404)
    const [{ data, error }, names] = await Promise.all([
      getServerSupabase().from('reminders').select(COLUMNS)
        .eq('store_id', ctx.storeId).eq('lead_id', leadId).order('reminder_date', { ascending: true }),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
    ])
    if (error) return serverError('GET /api/data/reminders?lead_id', error, 'Error al obtener recordatorios')
    return NextResponse.json({
      reminders: (data ?? []).map(({ user_id, ...r }) => ({
        ...reminderToApp(r),
        mine: user_id === ctx.uid,
        owner_name: user_id === ctx.uid ? null : (user_id ? names.get(user_id) ?? 'Otro usuario' : 'Sin asignar'),
      })),
    })
  }

  const { data, error } = await getServerSupabase()
    .from('reminders')
    .select(COLUMNS)
    .eq('user_id', ctx.uid)
    .eq('store_id', ctx.storeId)
    .order('reminder_date', { ascending: true })
  if (error) return serverError('GET /api/data/reminders', error, 'Error al obtener recordatorios')
  return NextResponse.json({ reminders: (data ?? []).map(({ user_id: _uid, ...r }) => ({ ...reminderToApp(r), mine: true })) })
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
