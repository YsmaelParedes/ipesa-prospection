import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS } from '@/lib/commercialServer'
import { amountDetail, deletedDetail, stateFromHistory, type HistoryActivity } from '@/lib/commercialChanges'

type Ctx = { params: Promise<{ id: string }> }
type Row = HistoryActivity & {
  id: string; contact_id: string | null; quote_amount: number | string | null; sale_amount: number | string | null
  prev_state: Record<string, unknown> | null
}
const MAX_AMOUNT = 1_000_000_000

async function findActivity(storeId: string, id: string) {
  const { data, error } = await getServerSupabase().from('commercial_activities')
    .select('id, contact_id, kind, result, note, quote_amount, sale_amount, next_action, next_action_at, created_at, prev_state')
    .eq('id', id).eq('store_id', storeId).maybeSingle()
  if (error) throw error
  return data as Row | null
}

/**
 * PATCH /api/data/commercial/activities/[id] { amount } — corrige el monto de
 * una cotización o venta registrada (solo administradores). Queda en el
 * historial del cliente quién lo corrigió y de cuánto a cuánto.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Actividad inválida')

  const body = await readJson(req)
  const amount = typeof body?.amount === 'number' ? body.amount : Number(body?.amount)
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return jsonError('Escribe un monto válido')
  const rounded = Math.round(amount * 100) / 100

  try {
    const a = await findActivity(ctx.storeId, id)
    if (!a) return jsonError('Actividad no encontrada', 404)
    if (a.quote_amount == null && a.sale_amount == null) return jsonError('Esta actividad no tiene monto')
    if (Number(a.sale_amount ?? a.quote_amount) === rounded) return jsonError('Ese ya es el monto')

    const { data, error } = await getServerSupabase().rpc('commercial_fix_amount', {
      p_store: ctx.storeId, p_actor: ctx.uid, p_activity: id, p_amount: rounded, p_detail: amountDetail(a, rounded),
    })
    if (error) {
      const user = rpcUserError(error)
      if (user) return jsonError(user.message, user.status)
      throw error
    }
    return NextResponse.json({ activity: data })
  } catch (error) {
    return serverError('PATCH /api/data/commercial/activities/[id]', error, 'No se pudo corregir el monto')
  }
}

/**
 * DELETE /api/data/commercial/activities/[id] — borra la actividad más
 * reciente de un cliente (solo administradores) y lo deja como estaba antes.
 * Si se registró antes de guardar ese estado (prev_state), se calcula con el
 * resto del historial.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Actividad inválida')

  const supabase = getServerSupabase()
  try {
    const a = await findActivity(ctx.storeId, id)
    if (!a) return jsonError('Actividad no encontrada', 404)
    if (!a.contact_id) return jsonError('El cliente de esta actividad ya no existe')

    let restore: Record<string, unknown> | null = null
    if (!a.prev_state) {
      const { data: rest, error } = await supabase.from('commercial_activities')
        .select('kind, result, note, next_action, next_action_at, created_at')
        .eq('store_id', ctx.storeId).eq('contact_id', a.contact_id).neq('id', a.id)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(2000)
      if (error) throw error
      restore = stateFromHistory((rest ?? []) as HistoryActivity[])
    }

    const { error } = await supabase.rpc('commercial_delete_last_activity', {
      p_store: ctx.storeId, p_actor: ctx.uid, p_activity: id, p_restore: restore, p_detail: deletedDetail(a),
    })
    if (error) {
      const user = rpcUserError(error)
      if (user) return jsonError(user.message, user.status)
      throw error
    }
    const { data: contact, error: readError } = await supabase.from('contacts').select(COMMERCIAL_COLUMNS)
      .eq('id', a.contact_id).eq('store_id', ctx.storeId).maybeSingle()
    if (readError) throw readError
    return NextResponse.json({ contact })
  } catch (error) {
    return serverError('DELETE /api/data/commercial/activities/[id]', error, 'No se pudo borrar la actividad')
  }
}
