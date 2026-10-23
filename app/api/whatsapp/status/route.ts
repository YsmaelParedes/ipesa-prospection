import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { GRAPH_VERSION, getPhoneHealth } from '@/lib/whatsapp'
import { credsFromRow, getStoreWhatsAppRow } from '@/lib/storeWhatsApp'

/**
 * GET /api/whatsapp/status (administrador) — si la tienda tiene WhatsApp
 * conectado + salud del número en Meta: calificación de calidad, nivel de
 * mensajería y health_status (AVAILABLE / LIMITED / BLOCKED).
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx

  const row = await getStoreWhatsAppRow(ctx.storeId)
  const creds = row ? credsFromRow(row) : null
  const config = {
    connected: !!creds,
    source: row?.credentials_source ?? 'store',
    businessAccount: !!creds?.wabaId,
    appSecret: !!creds?.appSecret,
  }
  const health = creds ? await getPhoneHealth(creds) : null
  return NextResponse.json({ config, health, graphVersion: GRAPH_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = withServerTiming(GETImpl)
