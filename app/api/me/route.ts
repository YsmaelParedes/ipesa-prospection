import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse, after } from 'next/server'
import {
  displayNameOf, getServerSupabase, getSessionUser, invalidateStoreMembers,
  resolveStoreContext, unauthorizedResponse,
} from '@/lib/supabase-server'
import { sessionPayload } from '@/lib/storeServer'
import { jsonError, readJson, serverError } from '@/lib/validation'

/**
 * GET /api/me — quién soy, en qué tienda estoy y qué puedo hacer.
 * Sin tienda todavía → { store: null } y el cliente manda al alta de tienda.
 * Anota que la tienda se usó (y cancela su eliminación por inactividad).
 */
async function GETImpl() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const ctx = await resolveStoreContext(user)
    const me = { id: user.id, email: user.email ?? '', name: displayNameOf(user) }
    if (!ctx) return NextResponse.json({ user: me, store: null, stores: [] }, { headers: { 'Cache-Control': 'no-store' } })
    const storeId = ctx.storeId
    after(async () => {
      const { error } = await getServerSupabase().rpc('touch_store_seen', { p_store: storeId })
      if (error) console.error('[GET /api/me] touch_store_seen', error.message)
    })
    return NextResponse.json({ user: me, ...sessionPayload(ctx) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serverError('GET /api/me', error, 'Error al cargar tu sesión')
  }
}

// PATCH /api/me — cambiar mi nombre visible
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const body = await readJson(req)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 60) return jsonError('El nombre debe tener entre 2 y 60 caracteres')

  const { error } = await getServerSupabase().auth.admin.updateUserById(user.id, {
    user_metadata: { display_name: name },  // Auth combina con el resto de user_metadata
  })
  if (error) return serverError('PATCH /api/me', error, 'No se pudo actualizar tu nombre')
  invalidateStoreMembers()
  return NextResponse.json({ ok: true, name })
}

export const GET = withServerTiming(GETImpl)
