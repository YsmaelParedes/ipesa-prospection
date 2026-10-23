import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError, type Schema } from '@/lib/validation'
import { COMMERCIAL_COLUMNS, getVisibleContact } from '@/lib/commercialServer'
import { COMMERCIAL_STATUSES, PRIORITIES, todayISO } from '@/lib/commercial'

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET /api/data/commercial/contacts/[id] — ficha comercial de un contacto:
 * datos, responsable y si quien pregunta puede registrar. Para el dueño o un
 * administrador, también el equipo (para reasignar).
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id) || !(await getVisibleContact(ctx, id))) return jsonError('Contacto no encontrado', 404)

  try {
    const [{ data, error }, members] = await Promise.all([
      getServerSupabase().from('contacts').select(COMMERCIAL_COLUMNS).eq('id', id).eq('store_id', ctx.storeId).maybeSingle(),
      getStoreMembers(ctx.storeId).catch(() => []),
    ])
    if (error) throw error
    if (!data) return jsonError('Contacto no encontrado', 404)
    const contact = data as unknown as { owner_id: string | null }
    const active = members.filter(m => m.status === 'active')
    return NextResponse.json({
      today: todayISO(ctx.store.timezone),
      contact: { ...contact, owner_name: contact.owner_id ? (members.find(m => m.user_id === contact.owner_id)?.display_name ?? 'Usuario') : null },
      canWork: contact.owner_id === null || contact.owner_id === ctx.uid,
      team: ctx.isAdmin ? active.map(m => ({ user_id: m.user_id, name: m.display_name, role: m.role })) : [],
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/contacts/[id]', error, 'No se pudo abrir el contacto')
  }
}

const SCHEMA: Schema = {
  commercial_status: { type: 'enum', values: COMMERCIAL_STATUSES, label: 'Estado' },
  next_action:       { type: 'text', max: 200, nullable: true, label: 'Próxima acción' },
  next_action_at:    { type: 'date', nullable: true, label: 'Fecha de la próxima acción' },
  priority:          { type: 'enum', values: PRIORITIES, label: 'Prioridad' },
  potential_monthly: { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Potencial mensual' },
  owner_id:          { type: 'uuid', nullable: true, label: 'Responsable' },
}

/**
 * PATCH /api/data/commercial/contacts/[id] — cambia a mano el estado, la
 * próxima acción, la prioridad o el potencial mensual (su responsable o el
 * dueño/administrador). Reasignar (owner_id) solo el dueño o un administrador.
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
  if (!ctx.isAdmin && contact.owner_id !== ctx.uid) return jsonError('Este contacto lo trabaja otra persona del equipo', 403)

  const supabase = getServerSupabase()
  if ('owner_id' in parsed.data) {
    if (!ctx.isAdmin) return jsonError('Solo el dueño o un administrador puede reasignar', 403)
    const owner = parsed.data.owner_id as string | null
    if (owner) {
      const { data: member } = await supabase.from('store_members').select('user_id')
        .eq('store_id', ctx.storeId).eq('user_id', owner).eq('status', 'active').maybeSingle()
      if (!member) return jsonError('Esa persona no está activa en el equipo')
    }
  }

  const { data, error } = await supabase.from('contacts')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id).eq('store_id', ctx.storeId)
    .select(COMMERCIAL_COLUMNS).maybeSingle()
  if (error) return serverError('PATCH /api/data/commercial/contacts/[id]', error, 'No se pudo actualizar el contacto')
  if (!data) return jsonError('Contacto no encontrado', 404)
  return NextResponse.json({ contact: data })
}
