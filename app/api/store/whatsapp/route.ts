import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { credsFromRow, getStoreWhatsAppRow } from '@/lib/storeWhatsApp'
import { jsonError, serverError } from '@/lib/validation'
import { SignupError, disconnectEmbedded } from '@/lib/whatsappSignup'

/**
 * GET /api/store/whatsapp (administrador) — si el número de la tienda ya está
 * conectado y cómo. Sin datos técnicos ni secretos: el id de la cuenta solo
 * sirve para abrir el administrador de WhatsApp de Meta (agregar tarjeta).
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx
  const row = await getStoreWhatsAppRow(ctx.storeId)
  if (!row) return jsonError('Configuración de WhatsApp no encontrada', 404)
  const creds = credsFromRow(row)
  const embedded = row.connection_method === 'embedded'
  return NextResponse.json({
    connected: !!creds && (!embedded || !!row.connected_at),
    displayPhone: row.display_phone,
    connectedAt: row.connected_at,
    receivesMessages: !!creds?.appSecret,
    /** La conectó la tienda (puede desconectarla); si no, la conectó el asesor */
    selfService: embedded,
    coexistence: row.coexistence,
    history: embedded && row.coexistence ? { status: row.history_status, imported: row.history_imported } : null,
    wabaId: embedded ? row.waba_id : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = withServerTiming(GETImpl)

/** DELETE /api/store/whatsapp (administrador) — desconecta un número que la tienda conectó sola. */
export async function DELETE() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  try {
    await disconnectEmbedded(ctx)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status)
    return serverError('DELETE /api/store/whatsapp', error, 'No se pudo desconectar el número. Intenta otra vez.')
  }
}
