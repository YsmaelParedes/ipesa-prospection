import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { REMINDER_SCHEMA, reminderToApp, reminderToDB } from '@/lib/reminders'
import { getAccessibleLead } from '@/lib/leads'
import { naiveIso, zonedIso } from '@/lib/datetime'

type Ctx = { params: Promise<{ id: string }> }

async function ownReminder(uid: string, storeId: string, id: string) {
  const { data } = await getServerSupabase().from('reminders').select('user_id, reminder_date')
    .eq('id', id).eq('store_id', storeId).maybeSingle()
  return data && data.user_id === uid ? data : null
}

// PATCH /api/data/reminders/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Recordatorio no encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const parsed = parseFields(body, REMINDER_SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  const updates = reminderToDB(parsed.data) as Record<string, unknown>
  if (Object.keys(updates).length === 0) return jsonError('No se proporcionaron campos válidos para actualizar')

  const own = await ownReminder(ctx.uid, ctx.storeId, id)
  if (!own) return jsonError('Recordatorio no encontrado', 404)
  if (updates.lead_id && !(await getAccessibleLead(ctx, updates.lead_id as string))) return jsonError('Lead no encontrado', 404)

  // Al reprogramarlo (o posponerlo) o reabrirlo, el aviso push vuelve a salir
  // a su nueva hora; si esa hora ya pasó, no se avisa (ya lo tiene a la vista).
  // Ambas son horas locales de la tienda en formato ISO: se comparan como texto.
  const reschedules = typeof updates.reminder_date === 'string' || updates.completado === false
  const pushSent = reschedules
    ? naiveIso(updates.reminder_date ?? own.reminder_date) <= zonedIso(new Date(), ctx.store.timezone)
    : undefined

  const { data, error } = await getServerSupabase()
    .from('reminders')
    .update({
      ...updates,
      ...(updates.completado === true  ? { completado_at: new Date().toISOString() } : {}),
      ...(updates.completado === false ? { completado_at: null } : {}),
      ...(pushSent !== undefined ? { push_sent: pushSent } : {}),
    })
    .eq('id', id)
    .eq('store_id', ctx.storeId)
    .select()
  if (error) return serverError('PATCH /api/data/reminders/[id]', error, 'Error al actualizar recordatorio')
  return NextResponse.json(data?.[0] ? reminderToApp(data[0]) : {})
}

// DELETE /api/data/reminders/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Recordatorio no encontrado', 404)
  if (!(await ownReminder(ctx.uid, ctx.storeId, id))) return jsonError('Recordatorio no encontrado', 404)

  const { error } = await getServerSupabase().from('reminders').delete().eq('id', id).eq('store_id', ctx.storeId)
  if (error) return serverError('DELETE /api/data/reminders/[id]', error, 'Error al eliminar recordatorio')
  return NextResponse.json({ success: true })
}
