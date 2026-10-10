import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { fetchPaged } from '@/lib/campaignHistory'
import { TEMPLATE_REPEAT_DAYS } from '@/lib/whatsappSafety'
import { serverError } from '@/lib/validation'

const DAY = 24 * 60 * 60 * 1000

/**
 * GET /api/whatsapp/campaigns/stats (solo admin)
 * Destinatarios recientes de cada plantilla, para no repetirla a la misma
 * persona antes de TEMPLATE_REPEAT_DAYS días (los resultados de cada campaña
 * están en /api/whatsapp/campaigns/history).
 */
export async function GET() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx

  try {
    const supabase = getServerSupabase()
    const since = new Date(Date.now() - TEMPLATE_REPEAT_DAYS * DAY).toISOString()
    const sends = await fetchPaged<{ phone: string; template_name: string }>((from, to) =>
      supabase.from('whatsapp_messages')
        .select('phone, template_name')
        .eq('store_id', ctx.storeId)
        .eq('direction', 'outbound').not('template_name', 'is', null)
        .neq('status', 'failed') // un envío rechazado por Meta no cuenta como "ya la recibió"
        .gte('created_at', since)
        .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to))

    const recentRecipients: Record<string, string[]> = {}
    for (const m of sends) (recentRecipients[m.template_name] ??= []).push(m.phone)
    for (const t of Object.keys(recentRecipients)) recentRecipients[t] = [...new Set(recentRecipients[t])]

    return NextResponse.json({ repeatDays: TEMPLATE_REPEAT_DAYS, recentRecipients })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/stats', error, 'Error al obtener los envíos recientes')
  }
}
