import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { GRAPH_VERSION, getPhoneHealth } from '@/lib/whatsapp'
import { credsFromRow, getStoreWhatsAppRow } from '@/lib/storeWhatsApp'

/**
 * GET /api/whatsapp/status (dueño/admin) — si la tienda tiene WhatsApp
 * conectado + salud del número en Meta: calificación de calidad y nivel de
 * mensajería. Si la calidad baja a YELLOW/RED hay que pausar campañas antes
 * de que Meta restrinja el número.
 */
export async function GET() {
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
