import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requireStore } from '@/lib/supabase-server'
import { STORE_PROFILE_SCHEMA, publicStore } from '@/lib/storeServer'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

// GET /api/store — perfil de la tienda activa
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  return NextResponse.json({ store: publicStore(ctx.store) }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * PATCH /api/store — dueño/admin: datos de la tienda y "terminé la
 * configuración inicial". Los módulos (WhatsApp, Campañas, Fórmulas) ya no se
 * cambian desde la tienda; el estado, plan y fechas de pago solo los cambia
 * el administrador de la plataforma.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, STORE_PROFILE_SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  const updates: Record<string, unknown> = { ...parsed.data }

  if (body.modules !== undefined) return jsonError('Las herramientas de la tienda no se pueden cambiar', 403)
  if (body.onboardingCompleted === true && !ctx.store.onboarding_completed_at) {
    updates.onboarding_completed_at = new Date().toISOString()
  }
  if (Object.keys(updates).length === 0) return jsonError('No se proporcionaron campos válidos para actualizar')

  // Configurar la tienda sí se permite en solo lectura (no es registrar datos de clientes)
  const { error } = await getServerSupabase().from('stores')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', ctx.storeId)
  if (error) return serverError('PATCH /api/store', error, 'No se pudo guardar la tienda')

  invalidateMemberships()
  return NextResponse.json({ ok: true })
}
