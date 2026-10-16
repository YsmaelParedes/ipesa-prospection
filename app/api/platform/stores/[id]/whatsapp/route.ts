import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/supabase-server'
import { logPlatformEvent } from '@/lib/platformEvents'
import { siteOrigin } from '@/lib/invitations'
import { connectStoreWhatsApp, disconnectStoreWhatsApp, whatsappConnectionInfo } from '@/lib/storeWhatsAppConnection'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Conexión del número de WhatsApp de una tienda — solo el dueño de la
 * plataforma (el asesor). GET: estado y datos del webhook · PUT: conectar o
 * actualizar credenciales · DELETE: desconectar. Queda en la bitácora.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  const info = await whatsappConnectionInfo(id, siteOrigin(req.nextUrl.origin))
  if (!info) return jsonError('Configuración de WhatsApp no encontrada', 404)
  return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  try {
    const result = await connectStoreWhatsApp(id, await readJson(req))
    if (!result.ok) return jsonError(result.error, result.status)
    await logPlatformEvent(id, user.id, 'whatsapp_connect', { display_phone: result.data.displayPhone })
    return NextResponse.json({ ok: true, ...result.data })
  } catch (error) {
    return serverError('PUT /api/platform/stores/[id]/whatsapp', error, 'No se pudo guardar la conexión')
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  try {
    const result = await disconnectStoreWhatsApp(id)
    if (!result.ok) return jsonError(result.error, result.status)
    await logPlatformEvent(id, user.id, 'whatsapp_disconnect')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('DELETE /api/platform/stores/[id]/whatsapp', error, 'No se pudo desconectar')
  }
}
