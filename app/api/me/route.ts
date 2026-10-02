import { NextRequest, NextResponse } from 'next/server'
import {
  displayNameOf, getServerSupabase, getSessionUser, invalidateStoreMembers, isPlatformAdmin,
  resolveStoreContext, unauthorizedResponse,
} from '@/lib/supabase-server'
import { sessionPayload } from '@/lib/storeServer'
import { jsonError, readJson, serverError } from '@/lib/validation'

/**
 * GET /api/me — quién soy, en qué tienda estoy y qué puedo hacer.
 * Sin tienda todavía → { store: null } y el cliente manda al alta de tienda.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const [ctx, platformAdmin] = await Promise.all([resolveStoreContext(user), isPlatformAdmin(user.id)])
    const me = { id: user.id, email: user.email ?? '', name: displayNameOf(user) }
    if (!ctx) return NextResponse.json({ user: me, store: null, stores: [], platformAdmin }, { headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json({ user: me, platformAdmin, ...sessionPayload(ctx) }, { headers: { 'Cache-Control': 'no-store' } })
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
