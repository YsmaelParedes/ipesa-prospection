import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getAuthClient, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// Guardar suscripción push vinculada al usuario autenticado
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint, keys } = body

    if (!endpoint || typeof endpoint !== 'string' || endpoint.length > 2048) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }
    if (!keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }
    if (typeof keys.p256dh !== 'string' || keys.p256dh.length > 256) {
      return NextResponse.json({ error: 'Clave p256dh inválida' }, { status: 400 })
    }
    if (typeof keys.auth !== 'string' || keys.auth.length > 64) {
      return NextResponse.json({ error: 'Clave auth inválida' }, { status: 400 })
    }

    // Obtener user_id de la sesión actual — require authentication
    const authClient = await getAuthClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return unauthorizedResponse()

    const supabase = getServerSupabase()
    const { error } = await supabase.from('push_subscriptions').upsert(
      { endpoint, p256dh: keys.p256dh, auth: keys.auth, user_id: user.id },
      { onConflict: 'endpoint' }
    )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[POST /api/push/subscribe]', e?.message)
    return NextResponse.json({ error: 'Error al registrar suscripción' }, { status: 500 })
  }
}

// Eliminar suscripción (cuando el usuario desactiva notificaciones)
export async function DELETE(req: NextRequest) {
  try {
    // Require authentication — prevents unauthenticated callers from deleting arbitrary push subscriptions
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const { endpoint } = await req.json()
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Endpoint requerido' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    // Only delete subscriptions that belong to the authenticated user
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', uid)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: 'Error al eliminar suscripción' }, { status: 500 })
  }
}
