import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

/* GET /api/admin/profiles — lista todos los usuarios con su display_name */
export async function GET() {
  const supabase = getServerSupabase()

  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 50 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = data.users.map(u => ({
    id:           u.id,
    email:        u.email ?? '',
    display_name: (u.user_metadata?.display_name as string) ?? '',
  }))

  return NextResponse.json({ users })
}

/* POST /api/admin/profiles — actualiza display_name de un usuario */
export async function POST(req: NextRequest) {
  const { userId, displayName } = await req.json()

  if (!userId || typeof displayName !== 'string') {
    return NextResponse.json({ error: 'userId y displayName requeridos' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { display_name: displayName.trim() },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
