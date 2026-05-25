import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

// Guardar suscripción push de un dispositivo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { endpoint, keys } = body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase.from('push_subscriptions').upsert(
      { endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' }
    )

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[POST /api/push/subscribe]', e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

// Eliminar suscripción (cuando el usuario desactiva notificaciones)
export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json()
    if (!endpoint) return NextResponse.json({ error: 'Endpoint requerido' }, { status: 400 })

    const supabase = getServerSupabase()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
