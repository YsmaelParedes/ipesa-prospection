import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireAdmin, roleOf, invalidateUserNameCache } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

// GET /api/admin/users — lista todos los usuarios con su rol (solo admin)
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  const { data, error } = await getServerSupabase().auth.admin.listUsers({ perPage: 200 })
  if (error) return serverError('GET /api/admin/users', error, 'Error al obtener usuarios')

  const users = data.users.map(u => ({
    id:           u.id,
    email:        u.email ?? '',
    display_name: (u.user_metadata?.display_name as string) ?? '',
    role:         roleOf(u),
  }))
  return NextResponse.json({ users })
}

// PATCH /api/admin/users — cambia el rol de un usuario (solo admin)
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const { userId, role } = body
  if (!isUUID(userId)) return jsonError('userId es requerido')
  if (role !== 'admin' && role !== 'employee') return jsonError('role debe ser "admin" o "employee"')
  if (userId === ctx.uid && role !== 'admin') return jsonError('No puedes quitarte tu propio rol de administrador')

  const supabase = getServerSupabase()
  const { data: existing, error: fetchError } = await supabase.auth.admin.getUserById(userId)
  if (fetchError || !existing.user) return jsonError('Usuario no encontrado', 404)

  // Nunca dejar la app sin ningún administrador
  if (role !== 'admin' && roleOf(existing.user) === 'admin') {
    const { data: all, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 })
    if (listError) return serverError('PATCH /api/admin/users', listError)
    if (all.users.filter(u => roleOf(u) === 'admin').length <= 1) {
      return jsonError('No puedes quitar el último administrador de la aplicación')
    }
  }

  // El rol se guarda en app_metadata (solo editable con service_role). Auth
  // hace merge de los metadatos y una llave en null la elimina: así se borra
  // la copia vieja de user_metadata para que no quede un rol "fantasma".
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata:  { role },
    user_metadata: { role: null },
  })
  if (error) return serverError('PATCH /api/admin/users', error, 'Error al actualizar el rol')

  invalidateUserNameCache()
  return NextResponse.json({ ok: true })
}
