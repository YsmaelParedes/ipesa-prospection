import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError, type Schema } from '@/lib/validation'
import { COMMERCIAL_COLUMNS, getVisibleContact } from '@/lib/commercialServer'
import { COMMERCIAL_STATUSES, PRIORITIES } from '@/lib/commercial'

type Ctx = { params: Promise<{ id: string }> }

const SCHEMA: Schema = {
  commercial_status: { type: 'enum', values: COMMERCIAL_STATUSES, label: 'Estado' },
  next_action:       { type: 'text', max: 200, nullable: true, label: 'Próxima acción' },
  next_action_at:    { type: 'date', nullable: true, label: 'Fecha de la próxima acción' },
  priority:          { type: 'enum', values: PRIORITIES, label: 'Prioridad' },
  potential_monthly: { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Potencial mensual' },
}

/**
 * PATCH /api/data/commercial/contacts/[id] — cambia a mano el estado, la
 * próxima acción (reprogramar, sacar de "Por depurar"), la prioridad o el
 * potencial mensual. Solo el responsable o el dueño/administrador.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Contacto no encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  if (!Object.keys(parsed.data).length) return jsonError('No se proporcionaron campos válidos para actualizar')

  const contact = await getVisibleContact(ctx, id)
  if (!contact) return jsonError('Contacto no encontrado', 404)

  const { data, error } = await getServerSupabase().from('contacts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id).eq('store_id', ctx.storeId)
    .select(COMMERCIAL_COLUMNS).maybeSingle()
  if (error) return serverError('PATCH /api/data/commercial/contacts/[id]', error, 'No se pudo actualizar el contacto')
  if (!data) return jsonError('Contacto no encontrado', 404)
  return NextResponse.json({ contact: data })
}
