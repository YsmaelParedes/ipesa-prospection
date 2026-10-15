import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requirePlatformAdmin } from '@/lib/supabase-server'
import { rpcUserError } from '@/lib/platformEvents'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

/**
 * POST /api/platform/payments/[id]/void { reason? } — anular un pago capturado
 * por error. No se borra: queda marcado y la vigencia de la tienda regresa a
 * como estaba antes (void_store_payment). Solo el pago más reciente vigente
 * de cada tienda; si la vigencia se movió a mano después, no se toca
 * (restored: false).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const { id } = await params
  if (!isUUID(id)) return jsonError('Pago no encontrado', 404)
  const body = (await readJson(req)) ?? {}
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length > 300) return jsonError('Motivo muy largo (máximo 300)')

  const { data, error } = await getServerSupabase().rpc('void_store_payment', { p_payment: id, p_actor: user.id, p_reason: reason || null })
  const known = rpcUserError(error)
  if (known) return jsonError(known.message, known.status)
  if (error) return serverError('POST /api/platform/payments/[id]/void', error, 'No se pudo anular el pago')

  invalidateMemberships()
  return NextResponse.json({ ok: true, restored: !!data?.restored })
}
