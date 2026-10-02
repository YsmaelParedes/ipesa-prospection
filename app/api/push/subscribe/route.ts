import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { jsonError, readJson, serverError } from '@/lib/validation'

function validEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 2048) return false
  try { return new URL(v).protocol === 'https:' } catch { return false }
}

// GET /api/push/subscribe?endpoint=… — preferencias de este dispositivo
export async function GET(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!validEndpoint(endpoint)) return jsonError('Endpoint inválido')

  const { data } = await getServerSupabase()
    .from('push_subscriptions')
    .select('notify_whatsapp')
    .eq('endpoint', endpoint)
    .eq('user_id', ctx.uid)
    .maybeSingle()
  return NextResponse.json({ subscribed: !!data, notifyWhatsapp: data?.notify_whatsapp ?? true })
}

// POST — guarda (o re-vincula) la suscripción push del usuario autenticado
export async function POST(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  const keys = body?.keys as { p256dh?: unknown; auth?: unknown } | undefined
  if (!body || !validEndpoint(body.endpoint)) return jsonError('Suscripción inválida')
  if (typeof keys?.p256dh !== 'string' || keys.p256dh.length > 256) return jsonError('Clave p256dh inválida')
  if (typeof keys?.auth !== 'string' || keys.auth.length > 64) return jsonError('Clave auth inválida')

  const row: Record<string, unknown> = { endpoint: body.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_id: ctx.uid }
  if (typeof body.notifyWhatsapp === 'boolean') row.notify_whatsapp = body.notifyWhatsapp

  const { error } = await getServerSupabase().from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (error) return serverError('POST /api/push/subscribe', error, 'Error al registrar suscripción')
  return NextResponse.json({ ok: true })
}

// PATCH — cambia preferencias del dispositivo (avisos de WhatsApp)
export async function PATCH(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body || !validEndpoint(body.endpoint) || typeof body.notifyWhatsapp !== 'boolean') return jsonError('Datos inválidos')

  const { error } = await getServerSupabase()
    .from('push_subscriptions')
    .update({ notify_whatsapp: body.notifyWhatsapp })
    .eq('endpoint', body.endpoint)
    .eq('user_id', ctx.uid)
  if (error) return serverError('PATCH /api/push/subscribe', error, 'Error al guardar la preferencia')
  return NextResponse.json({ ok: true })
}

// DELETE — elimina la suscripción (solo si pertenece al usuario autenticado)
export async function DELETE(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body || !validEndpoint(body.endpoint)) return jsonError('Endpoint requerido')

  const { error } = await getServerSupabase()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)
    .eq('user_id', ctx.uid)
  if (error) return serverError('DELETE /api/push/subscribe', error, 'Error al eliminar suscripción')
  return NextResponse.json({ ok: true })
}
