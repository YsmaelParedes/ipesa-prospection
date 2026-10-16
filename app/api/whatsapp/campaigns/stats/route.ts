import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { fetchPaged } from '@/lib/campaignHistory'
import { loadPeople } from '@/lib/campaignPeople'
import type { PersonState } from '@/lib/campaignKinds'
import { MARKETING_RETRY_HOURS } from '@/lib/whatsappSafety'
import { serverError } from '@/lib/validation'

/**
 * GET /api/whatsapp/campaigns/stats (solo admin)
 * Para elegir destinatarios: a quién Meta pidió no reenviarle marketing por
 * ahora (`marketingHold`: error 131049 en las últimas MARKETING_RETRY_HOURS
 * horas, ver templates/marketing-templates/per-user-limits) y cómo le fue a
 * cada número con las campañas (`states`; los "sin WhatsApp" no se pueden
 * elegir). Los resultados de cada campaña están en /api/whatsapp/campaigns/history.
 */
export async function GET() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx

  try {
    const supabase = getServerSupabase()
    const since = new Date(Date.now() - MARKETING_RETRY_HOURS * 60 * 60 * 1000).toISOString()
    const [holds, people] = await Promise.all([
      fetchPaged<{ phone: string }>((from, to) =>
        supabase.from('whatsapp_messages')
          .select('phone')
          .eq('store_id', ctx.storeId)
          .eq('direction', 'outbound').eq('error_code', 131049)
          .gte('updated_at', since)
          .order('id', { ascending: true }).range(from, to)),
      loadPeople(ctx.storeId),
    ])

    const marketingHold = [...new Set(holds.map(m => m.phone))]
    const states: Record<string, PersonState> = Object.fromEntries(people.map(p => [p.phone, p.state]))

    return NextResponse.json({ marketingHold, states })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/stats', error, 'Error al obtener los envíos recientes')
  }
}
