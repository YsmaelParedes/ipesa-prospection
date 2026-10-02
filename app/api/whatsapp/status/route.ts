import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase-server'
import { GRAPH_VERSION, getPhoneHealth } from '@/lib/whatsapp'

/**
 * GET /api/whatsapp/status (solo admin) — qué variables de entorno están
 * configuradas (sin revelar valores) + salud del número en Meta: calificación
 * de calidad y nivel de mensajería. Si la calidad baja a YELLOW/RED hay que
 * pausar campañas antes de que Meta restrinja el número.
 */
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  const has = (key: string) => !!process.env[key]
  const config = {
    accessToken:     has('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId:   has('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccount: has('WHATSAPP_BUSINESS_ACCOUNT_ID'),
    appSecret:       has('WHATSAPP_APP_SECRET'),
    verifyToken:     has('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    cronSecret:      has('CRON_SECRET'),
    vapid:           has('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && has('VAPID_PRIVATE_KEY'),
  }
  const health = config.accessToken && config.phoneNumberId ? await getPhoneHealth() : null

  return NextResponse.json({ config, health, graphVersion: GRAPH_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}
