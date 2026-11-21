import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS } from '@/lib/commercialServer'
import { storeDays } from '@/lib/storeActivity'
import { followupDetail } from '@/lib/commercialChanges'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * POST /api/data/commercial/followup-date { contact_id, next_action_at, next_action? }
 * Pone o cambia la fecha del seguimiento sin registrar una actividad: no
 * cuenta para las metas y deja una línea en el historial. Mismo permiso que
 * cerrar el seguimiento: su responsable o un administrador (uno sin asignar, cualquiera).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  const contactId = body?.contact_id
  const nextAt = body?.next_action_at
  const rawAction = body?.next_action
  if (!isUUID(contactId)) return jsonError('Contacto inválido')
  if (typeof nextAt !== 'string' || !DATE_RE.test(nextAt) || Number.isNaN(Date.parse(nextAt))) return jsonError('Elige la fecha')
  if (rawAction != null && (typeof rawAction !== 'string' || rawAction.length > 200)) return jsonError('La acción es demasiado larga')
  const today = storeDays(ctx).today
  if (nextAt < today) return jsonError('Elige hoy o una fecha posterior')

  const supabase = getServerSupabase()
  const { data: contact, error: findError } = await supabase.from('contacts')
    .select('id, owner_id, next_action, next_action_at').eq('id', contactId).eq('store_id', ctx.storeId).maybeSingle()
  if (findError) return serverError('POST /api/data/commercial/followup-date', findError, 'No se pudo leer el contacto')
  if (!contact) return jsonError('Contacto no encontrado', 404)
  if (!ctx.isAdmin && contact.owner_id && contact.owner_id !== ctx.uid) {
    return jsonError('Este contacto lo trabaja otra persona del equipo', 403)
  }

  const action = (typeof rawAction === 'string' && rawAction.trim()) || contact.next_action || 'Dar seguimiento'
  if (contact.next_action_at === nextAt && action === (contact.next_action || 'Dar seguimiento')) {
    return jsonError('Esa ya es la fecha del seguimiento')
  }
  const detail = followupDetail({ at: contact.next_action_at ?? null, action: contact.next_action ?? null }, { at: nextAt, action })

  const { error } = await supabase.rpc('commercial_set_followup', {
    p_store: ctx.storeId, p_actor: ctx.uid, p_contact: contactId, p_next_at: nextAt, p_next_action: action, p_detail: detail,
  })
  if (error) {
    const user = rpcUserError(error)
    if (user) return jsonError(user.message, user.status)
    return serverError('POST /api/data/commercial/followup-date', error, 'No se pudo cambiar la fecha')
  }
  const { data, error: readError } = await supabase.from('contacts').select(COMMERCIAL_COLUMNS)
    .eq('id', contactId).eq('store_id', ctx.storeId).maybeSingle()
  if (readError) return serverError('POST /api/data/commercial/followup-date', readError, 'No se pudo leer el contacto')
  return NextResponse.json({ contact: data })
}
