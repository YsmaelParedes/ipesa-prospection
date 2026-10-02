import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { REMINDER_SCHEMA, reminderToApp, reminderToDB } from '@/lib/reminders'
import { getAccessibleLead } from '@/lib/leads'

type Ctx = { params: Promise<{ id: string }> }

async function ownReminder(uid: string, id: string) {
  const { data } = await getServerSupabase().from('reminders').select('user_id').eq('id', id).maybeSingle()
  return !!data && data.user_id === uid
}

// PATCH /api/data/reminders/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Recordatorio no encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const parsed = parseFields(body, REMINDER_SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  const updates = reminderToDB(parsed.data) as Record<string, unknown>
  if (Object.keys(updates).length === 0) return jsonError('No se proporcionaron campos válidos para actualizar')

  if (!(await ownReminder(ctx.uid, id))) return jsonError('Recordatorio no encontrado', 404)
  if (updates.lead_id && !(await getAccessibleLead(ctx, updates.lead_id as string))) return jsonError('Lead no encontrado', 404)

  // Volver a notificar si se reprograma o se reactiva el recordatorio. La
  // comparación es entre horas locales de México en formato ISO (texto).
  const nowLocal = new Date().toLocaleString('sv-SE', { timeZone: 'America/Mexico_City', hour12: false }).replace(' ', 'T')
  const newDate  = updates.reminder_date as string | undefined
  const resetPush = (!!newDate && newDate > nowLocal) || updates.completado === false

  const { data, error } = await getServerSupabase()
    .from('reminders')
    .update({
      ...updates,
      ...(updates.completado === true  ? { completado_at: new Date().toISOString() } : {}),
      ...(updates.completado === false ? { completado_at: null } : {}),
      ...(resetPush ? { push_sent: false } : {}),
    })
    .eq('id', id)
    .select()
  if (error) return serverError('PATCH /api/data/reminders/[id]', error, 'Error al actualizar recordatorio')
  return NextResponse.json(data?.[0] ? reminderToApp(data[0]) : {})
}

// DELETE /api/data/reminders/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Recordatorio no encontrado', 404)
  if (!(await ownReminder(ctx.uid, id))) return jsonError('Recordatorio no encontrado', 404)

  const { error } = await getServerSupabase().from('reminders').delete().eq('id', id)
  if (error) return serverError('DELETE /api/data/reminders/[id]', error, 'Error al eliminar recordatorio')
  return NextResponse.json({ success: true })
}
