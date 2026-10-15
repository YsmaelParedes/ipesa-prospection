import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requirePlatformAdmin } from '@/lib/supabase-server'
import { logPlatformEvent } from '@/lib/platformEvents'
import { isMoney } from '@/lib/payments'
import { PLANS, TRIAL_DAYS } from '@/lib/stores'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

const DAY = 24 * 60 * 60 * 1000

/**
 * PATCH /api/platform/stores/[id] — administración manual de una tienda.
 * { action: 'activate' } (sin vencimiento: tienda propia o acuerdo especial) ·
 * { action: 'extend_trial', days } · { action: 'suspend' } · { action: 'cancel' } ·
 * { plan } · { notes } · { monthlyPrice }
 * Extender la vigencia pagada se hace registrando un pago
 * (POST /api/platform/stores/[id]/payments), para que quede en el historial.
 * Todo queda en la bitácora (platform_events).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const db = getServerSupabase()
  const { data: store } = await db.from('stores').select('id, status, trial_ends_at, paid_until, plan, monthly_price').eq('id', id).maybeSingle()
  if (!store) return jsonError('Tienda no encontrada', 404)

  const now = Date.now()
  const updates: Record<string, unknown> = {}
  const events: { action: string; detail: Record<string, unknown> }[] = []
  switch (body.action) {
    case 'activate': {
      if (body.months !== undefined && Number(body.months) !== 0) return jsonError('Para extender la vigencia registra un pago')
      Object.assign(updates, { status: 'active', paid_until: null })
      events.push({ action: 'activate_unlimited', detail: { prev_status: store.status, prev_paid_until: store.paid_until } })
      break
    }
    case 'extend_trial': {
      const days = Number(body.days) || TRIAL_DAYS
      if (!Number.isInteger(days) || days < 1 || days > 90) return jsonError('Días inválidos')
      const base = store.trial_ends_at && new Date(store.trial_ends_at).getTime() > now ? new Date(store.trial_ends_at).getTime() : now
      Object.assign(updates, { status: 'trial', trial_ends_at: new Date(base + days * DAY).toISOString() })
      events.push({ action: 'extend_trial', detail: { days, trial_ends_at: updates.trial_ends_at, prev_status: store.status } })
      break
    }
    case 'suspend':
    case 'cancel':
      updates.status = body.action === 'suspend' ? 'suspended' : 'cancelled'
      events.push({ action: body.action, detail: { prev_status: store.status } })
      break
    case undefined: break
    default: return jsonError('Acción no válida')
  }
  if (body.plan !== undefined) {
    if (typeof body.plan !== 'string' || !PLANS[body.plan]) return jsonError('Plan no válido')
    updates.plan = body.plan
    events.push({ action: 'plan', detail: { plan: body.plan, prev_plan: store.plan } })
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 2000)) return jsonError('Notas inválidas')
    updates.platform_notes = body.notes || null
    events.push({ action: 'notes', detail: {} })
  }
  if (body.monthlyPrice !== undefined) {
    const price = body.monthlyPrice === null || body.monthlyPrice === '' ? null : Number(body.monthlyPrice)
    if (price !== null && !isMoney(price)) {
      return jsonError('Precio inválido (hasta 2 decimales)')
    }
    updates.monthly_price = price
    events.push({ action: 'price', detail: { monthly_price: price, prev_monthly_price: store.monthly_price } })
  }
  if (!Object.keys(updates).length) return jsonError('Nada que actualizar')

  const { error } = await db.from('stores').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return serverError('PATCH /api/platform/stores/[id]', error, 'No se pudo actualizar la tienda')
  invalidateMemberships()
  await Promise.all(events.map(e => logPlatformEvent(id, user.id, e.action, e.detail)))
  return NextResponse.json({ ok: true })
}
