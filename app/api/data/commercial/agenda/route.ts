import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS } from '@/lib/commercialServer'
import { todayISO } from '@/lib/commercial'

const MAX_ITEMS = 500

/**
 * GET /api/data/commercial/agenda — seguimientos del sistema comercial para la
 * Agenda, con su fecha: los míos (vencidos, de hoy y próximos) y los sin
 * asignar que ya tienen fecha de hoy o antes (igual que la lista de Hoy).
 */
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const today = todayISO(ctx.store.timezone || 'America/Mexico_City')

  try {
    const { data, error } = await getServerSupabase().from('contacts').select(COMMERCIAL_COLUMNS)
      .eq('store_id', ctx.storeId)
      .or(`owner_id.eq.${ctx.uid},and(owner_id.is.null,next_action_at.lte.${today})`)
      .not('next_action_at', 'is', null).neq('commercial_status', 'depurar')
      .order('next_action_at', { ascending: true }).order('id', { ascending: true })
      .limit(MAX_ITEMS)
    if (error) throw error
    return NextResponse.json({ today, followUps: data ?? [] })
  } catch (error) {
    return serverError('GET /api/data/commercial/agenda', error, 'Error al obtener los seguimientos')
  }
}
