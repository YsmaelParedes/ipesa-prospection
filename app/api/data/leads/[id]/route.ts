import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { LEAD_SCHEMA, contactInStore, getAccessibleLead } from '@/lib/leads'
import { normalizePhone } from '@/lib/phone'

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/data/leads/[id] — dueño, admin o lead heredado sin dueño
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Lead no encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const parsed = parseFields(body, LEAD_SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  if (Object.keys(parsed.data).length === 0) return jsonError('No se proporcionaron campos válidos para actualizar')
  if (typeof parsed.data.phone === 'string') parsed.data.phone = normalizePhone(parsed.data.phone)

  const lead = await getAccessibleLead(ctx, id)
  if (!lead) return jsonError('Lead no encontrado', 404)
  if (parsed.data.contact_id && !(await contactInStore(ctx.storeId, parsed.data.contact_id as string))) {
    return jsonError('Contacto no encontrado', 404)
  }

  const { data, error } = await getServerSupabase().from('leads').update(parsed.data)
    .eq('id', id).eq('store_id', ctx.storeId).select()
  if (error) return serverError('PATCH /api/data/leads/[id]', error, 'Error al actualizar lead')
  return NextResponse.json(data?.[0] ?? {})
}

// DELETE /api/data/leads/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Lead no encontrado', 404)

  const lead = await getAccessibleLead(ctx, id)
  if (!lead) return jsonError('Lead no encontrado', 404)

  const { error } = await getServerSupabase().from('leads').delete().eq('id', id).eq('store_id', ctx.storeId)
  if (error) return serverError('DELETE /api/data/leads/[id]', error, 'Error al eliminar lead')
  return NextResponse.json({ success: true })
}
