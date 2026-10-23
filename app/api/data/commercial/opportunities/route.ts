import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { COMMERCIAL_COLUMNS } from '@/lib/commercialServer'
import { STAGE_PROBABILITY, daysSince, todayISO } from '@/lib/commercial'

type Row = Record<string, unknown> & { id: string; owner_id: string | null; last_activity_at: string | null }

/**
 * GET /api/data/commercial/opportunities[?scope=team] — cotizaciones abiertas,
 * la más vieja primero, con el monto y la fecha de la última cotización.
 * Vendedor: las suyas. administrador: las suyas o, con scope=team, las
 * de todo el equipo.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const team = ctx.isAdmin && req.nextUrl.searchParams.get('scope') === 'team'
  const today = todayISO(ctx.store.timezone)
  const supabase = getServerSupabase()

  try {
    const [rows, names] = await Promise.all([
      fetchPaged<Row>((from, to) => {
        let q = supabase.from('contacts').select(COMMERCIAL_COLUMNS).eq('store_id', ctx.storeId).eq('commercial_status', 'cotizacion')
        if (!team) q = q.eq('owner_id', ctx.uid)
        return q.order('last_activity_at', { ascending: true, nullsFirst: true }).order('id', { ascending: true }).range(from, to)
      }, 5000),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
    ])

    const quotes = new Map<string, { amount: number; at: string }>()
    const ids = rows.map(r => r.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('commercial_activities').select('contact_id, quote_amount, created_at')
        .eq('store_id', ctx.storeId).in('contact_id', ids.slice(i, i + 200)).not('quote_amount', 'is', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      for (const a of data ?? []) if (!quotes.has(a.contact_id)) quotes.set(a.contact_id, { amount: Number(a.quote_amount), at: a.created_at })
    }

    const probability = STAGE_PROBABILITY.cotizacion
    const opportunities = rows.map(r => {
      const q = quotes.get(r.id)
      return {
        ...r,
        owner_name: r.owner_id ? (names.get(r.owner_id) ?? 'Usuario') : null,
        quote_amount: q?.amount ?? 0,
        quoted_at: q?.at ?? null,
        probability,
        days_idle: daysSince(r.last_activity_at, today),
      }
    })
    const quoted = opportunities.reduce((s, o) => s + o.quote_amount, 0)
    return NextResponse.json({
      today,
      team,
      opportunities,
      totals: {
        open: opportunities.length,
        quoted,
        expected: Math.round(quoted * probability),
        stale: opportunities.filter(o => (o.days_idle ?? 0) > 7).length,
      },
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/opportunities', error, 'Error al obtener las oportunidades')
  }
}
