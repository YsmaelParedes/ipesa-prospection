import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { emailConfigured, escapeHtml, sendEmail } from '@/lib/email'
import { EMAILS } from '@/lib/legal'
import { jsonError, serverError } from '@/lib/validation'
import { planOf } from '@/lib/stores'

/**
 * POST /api/store/whatsapp-request — "Quiero activarlo" (administradores).
 * Guarda la fecha en la tienda y avisa por correo a hola@ para que un asesor
 * contacte a la tienda; la tienda no puede activar WhatsApp por su cuenta. Repetirla
 * no cambia la fecha original. Se permite aunque la tienda esté en solo lectura.
 * Solo en planes que incluyen WhatsApp (Cubeta, Interno).
 */
export async function POST() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  if (ctx.modules.whatsapp) return NextResponse.json({ ok: true, active: true })
  // WhatsApp viene en Cubeta: en Litro y Galón primero hay que cambiar de plan
  if (!planOf(ctx.plan).whatsapp) return jsonError('WhatsApp está incluido en el plan Cubeta. Cambia de plan para activarlo.', 402)
  if (ctx.store.whatsapp_requested_at) return NextResponse.json({ ok: true, requestedAt: ctx.store.whatsapp_requested_at })

  try {
    const requestedAt = new Date().toISOString()
    const { data, error } = await getServerSupabase().from('stores')
      .update({ whatsapp_requested_at: requestedAt })
      .eq('id', ctx.storeId).is('whatsapp_requested_at', null)
      .select('whatsapp_requested_at')
    if (error) throw error
    if (data?.length && emailConfigured()) {
      const who = ctx.user.email ?? ctx.uid
      await sendEmail({
        to: [EMAILS.hola],
        subject: `Solicitud de WhatsApp: ${ctx.store.name}`,
        text: `${ctx.store.name} (${ctx.storeId}) pidió activar WhatsApp. Lo pidió: ${who}.`,
        html: `<p><strong>${escapeHtml(ctx.store.name)}</strong> (${ctx.storeId}) pidió activar WhatsApp.</p><p>Lo pidió: ${escapeHtml(who)}</p>`,
        idempotencyKey: `whatsapp-request-${ctx.storeId}`,
      }).catch(e => console.error('[whatsapp-request] correo', e))
    }
    return NextResponse.json({ ok: true, requestedAt: data?.[0]?.whatsapp_requested_at ?? requestedAt })
  } catch (error) {
    return serverError('POST /api/store/whatsapp-request', error, 'No se pudo enviar la solicitud')
  }
}
