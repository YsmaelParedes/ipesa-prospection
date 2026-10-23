import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { credsFromRow, getStoreWhatsAppRow } from '@/lib/storeWhatsApp'
import { jsonError } from '@/lib/validation'

/**
 * GET /api/store/whatsapp (administrador) — si el número de la tienda ya está
 * conectado. Sin datos técnicos: la conexión (credenciales y webhook) la hace
 * el asesor directamente en la base.
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx
  const row = await getStoreWhatsAppRow(ctx.storeId)
  if (!row) return jsonError('Configuración de WhatsApp no encontrada', 404)
  const creds = credsFromRow(row)
  return NextResponse.json({
    connected: !!creds,
    displayPhone: row.display_phone,
    connectedAt: row.connected_at,
    receivesMessages: !!creds?.appSecret,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = withServerTiming(GETImpl)
