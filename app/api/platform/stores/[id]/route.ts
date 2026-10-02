import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requirePlatformAdmin } from '@/lib/supabase-server'
import { PLANS, TRIAL_DAYS } from '@/lib/stores'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

const DAY = 24 * 60 * 60 * 1000

/**
 * PATCH /api/platform/stores/[id] — administración manual de suscripciones.
 * { action: 'activate', months } · { action: 'extend_trial', days } ·
 * { action: 'suspend' } · { action: 'cancel' } · { plan } · { notes }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const db = getServerSupabase()
  const { data: store } = await db.from('stores').select('id, status, trial_ends_at, paid_until').eq('id', id).maybeSingle()
  if (!store) return jsonError('Tienda no encontrada', 404)

  const now = Date.now()
  const updates: Record<string, unknown> = {}
  switch (body.action) {
    case 'activate': {
      const months = Number(body.months)
      if (!Number.isInteger(months) || months < 0 || months > 36) return jsonError('Meses inválidos (0 = sin vencimiento)')
      // Se suma a lo ya pagado si sigue vigente; si no, desde hoy
      const base = store.paid_until && new Date(store.paid_until).getTime() > now ? new Date(store.paid_until) : new Date(now)
      if (months > 0) base.setMonth(base.getMonth() + months)
      Object.assign(updates, { status: 'active', paid_until: months > 0 ? base.toISOString() : null })
      break
    }
    case 'extend_trial': {
      const days = Number(body.days) || TRIAL_DAYS
      if (!Number.isInteger(days) || days < 1 || days > 90) return jsonError('Días inválidos')
      const base = store.trial_ends_at && new Date(store.trial_ends_at).getTime() > now ? new Date(store.trial_ends_at).getTime() : now
      Object.assign(updates, { status: 'trial', trial_ends_at: new Date(base + days * DAY).toISOString() })
      break
    }
    case 'suspend': updates.status = 'suspended'; break
    case 'cancel':  updates.status = 'cancelled'; break
    case undefined: break
    default: return jsonError('Acción no válida')
  }
  if (body.plan !== undefined) {
    if (typeof body.plan !== 'string' || !PLANS[body.plan]) return jsonError('Plan no válido')
    updates.plan = body.plan
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 2000)) return jsonError('Notas inválidas')
    updates.platform_notes = body.notes || null
  }
  if (!Object.keys(updates).length) return jsonError('Nada que actualizar')

  const { error } = await db.from('stores').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return serverError('PATCH /api/platform/stores/[id]', error, 'No se pudo actualizar la tienda')
  invalidateMemberships()
  return NextResponse.json({ ok: true })
}
