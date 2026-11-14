import { NextResponse } from 'next/server'
import { storeDays } from '@/lib/storeActivity'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS } from '@/lib/commercialServer'

const MAX_ITEMS = 500

/**
 * GET /api/data/commercial/agenda — seguimientos del sistema comercial para la
 * Agenda, con su fecha: los míos (vencidos, de hoy y próximos) y los sin
 * asignar que ya tienen fecha de hoy o antes (igual que la lista de Hoy).
 * Trae hasta MAX_ITEMS, los de fecha más próxima, y el total real para los contadores.
 */
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const today = storeDays(ctx).today

  try {
    const { data, error, count } = await getServerSupabase().from('contacts').select(COMMERCIAL_COLUMNS, { count: 'exact' })
      .eq('store_id', ctx.storeId)
      .or(`owner_id.eq.${ctx.uid},and(owner_id.is.null,next_action_at.lte.${today})`)
      .not('next_action_at', 'is', null).neq('commercial_status', 'depurar')
      .order('next_action_at', { ascending: true }).order('id', { ascending: true })
      .limit(MAX_ITEMS)
    if (error) throw error
    // La lista trae los MAX_ITEMS más próximos; total es cuántos hay en realidad
    return NextResponse.json({ today, followUps: data ?? [], total: count ?? data?.length ?? 0 })
  } catch (error) {
    return serverError('GET /api/data/commercial/agenda', error, 'Error al obtener los seguimientos')
  }
}
