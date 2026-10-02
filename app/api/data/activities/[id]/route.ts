import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireUser, type UserContext } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError, type Schema } from '@/lib/validation'
import { ACTIVITY_TYPES } from '@/lib/leads'

type Ctx = { params: Promise<{ id: string }> }

const ACTIVITY_UPDATE_SCHEMA: Schema = {
  type:          { type: 'enum', values: ACTIVITY_TYPES, label: 'Tipo' },
  description:   { type: 'text', max: 2000, nullable: true, label: 'Descripción' },
  amount:        { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Monto' },
  activity_date: { type: 'datetime', label: 'Fecha' },
}

/** Solo quien la registró (o un admin) puede editarla/borrarla. */
async function canModify(ctx: UserContext, id: string): Promise<boolean | null> {
  const { data } = await getServerSupabase().from('lead_activities').select('user_id').eq('id', id).maybeSingle()
  if (!data) return null
  return ctx.role === 'admin' || !data.user_id || data.user_id === ctx.uid
}

// PATCH /api/data/activities/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('No encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const parsed = parseFields(body, ACTIVITY_UPDATE_SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  if (Object.keys(parsed.data).length === 0) return jsonError('No se proporcionaron campos válidos para actualizar')

  const allowed = await canModify(ctx, id)
  if (allowed === null) return jsonError('No encontrado', 404)
  if (!allowed) return jsonError('Sin permisos', 403)

  const { data, error } = await getServerSupabase().from('lead_activities').update(parsed.data).eq('id', id).select()
  if (error) return serverError('PATCH /api/data/activities/[id]', error, 'Error al actualizar')
  return NextResponse.json(data?.[0] ?? {})
}

// DELETE /api/data/activities/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('No encontrado', 404)

  const allowed = await canModify(ctx, id)
  if (allowed === null) return jsonError('No encontrado', 404)
  if (!allowed) return jsonError('Sin permisos', 403)

  const { error } = await getServerSupabase().from('lead_activities').delete().eq('id', id)
  if (error) return serverError('DELETE /api/data/activities/[id]', error, 'Error al eliminar')
  return NextResponse.json({ success: true })
}
