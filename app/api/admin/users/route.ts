import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'

// GET /api/admin/users — lista todos los usuarios con su rol (solo admin)
export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = data.users.map(u => ({
    id:           u.id,
    email:        u.email ?? '',
    display_name: (u.user_metadata?.display_name as string) ?? '',
    role:         u.user_metadata?.role === 'admin' ? 'admin' : 'employee',
  }))

  return NextResponse.json({ users })
}

// PATCH /api/admin/users — cambia el rol de un usuario (solo admin)
export async function PATCH(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const { userId, role } = await req.json()
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
  }
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ error: 'role debe ser "admin" o "employee"' }, { status: 400 })
  }
  if (userId === ctx.uid && role !== 'admin') {
    return NextResponse.json({ error: 'No puedes quitarte tu propio rol de administrador' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Preserva el resto de user_metadata (display_name, etc.)
  const { data: existing, error: fetchError } = await supabase.auth.admin.getUserById(userId)
  if (fetchError || !existing.user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  // Nunca dejar la app sin ningún administrador
  if (role !== 'admin' && existing.user.user_metadata?.role === 'admin') {
    const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 })
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })
    const adminCount = allUsers.users.filter(u => u.user_metadata?.role === 'admin').length
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'No puedes quitar el último administrador de la aplicación' }, { status: 400 })
    }
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...existing.user.user_metadata, role },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
