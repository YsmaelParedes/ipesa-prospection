import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { logPlatformEvent } from '@/lib/platformEvents'
import { serverError } from '@/lib/validation'

/**
 * POST /api/store/whatsapp-request — "Quiero activarlo" (dueño/admin).
 * Deja la solicitud en el panel de la plataforma para que un asesor contacte
 * a la tienda; la tienda no puede activar WhatsApp por su cuenta. Repetirla
 * no cambia la fecha original. Se permite aunque la tienda esté en solo lectura.
 */
export async function POST() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  if (ctx.store.modules.whatsapp) return NextResponse.json({ ok: true, active: true })
  if (ctx.store.whatsapp_requested_at) return NextResponse.json({ ok: true, requestedAt: ctx.store.whatsapp_requested_at })

  try {
    const requestedAt = new Date().toISOString()
    const { data, error } = await getServerSupabase().from('stores')
      .update({ whatsapp_requested_at: requestedAt })
      .eq('id', ctx.storeId).is('whatsapp_requested_at', null)
      .select('whatsapp_requested_at')
    if (error) throw error
    if (data?.length) await logPlatformEvent(ctx.storeId, ctx.uid, 'whatsapp_request')
    return NextResponse.json({ ok: true, requestedAt: data?.[0]?.whatsapp_requested_at ?? requestedAt })
  } catch (error) {
    return serverError('POST /api/store/whatsapp-request', error, 'No se pudo enviar la solicitud')
  }
}
