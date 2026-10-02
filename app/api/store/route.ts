import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requireStore } from '@/lib/supabase-server'
import { STORE_PROFILE_SCHEMA, publicStore } from '@/lib/storeServer'
import { STORE_MODULES, normalizeModules } from '@/lib/stores'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

// GET /api/store — perfil de la tienda activa
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  return NextResponse.json({ store: publicStore(ctx.store) }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * PATCH /api/store — dueño/admin: datos de la tienda, módulos activos y
 * "terminé la configuración inicial". El estado, plan y fechas de pago solo
 * los cambia el administrador de la plataforma.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, STORE_PROFILE_SCHEMA, { partial: true })
  if (!parsed.ok) return jsonError(parsed.error)
  const updates: Record<string, unknown> = { ...parsed.data }

  if (body.modules !== undefined) {
    if (!body.modules || typeof body.modules !== 'object') return jsonError('Módulos inválidos')
    const incoming = body.modules as Record<string, unknown>
    if (Object.keys(incoming).some(k => !(STORE_MODULES as readonly string[]).includes(k) || typeof incoming[k] !== 'boolean')) {
      return jsonError('Módulos inválidos')
    }
    const modules = { ...normalizeModules(ctx.store.modules), ...(incoming as Record<string, boolean>) }
    if (!modules.whatsapp) modules.campaigns = false   // campañas dependen de WhatsApp
    updates.modules = modules
  }
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
