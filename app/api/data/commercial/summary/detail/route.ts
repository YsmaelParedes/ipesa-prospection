import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { storeDays } from '@/lib/storeActivity'
import { jsonError, serverError } from '@/lib/validation'
import { parseFilters, resolveRange } from '@/lib/reports'
import { reportActivities } from '@/lib/reportsServer'
import { activityClient, liveContactIds, quoteOutcomes, type QuoteOutcome } from '@/lib/commercialServer'
import { fetchPaged } from '@/lib/paged'

type Activity = {
  /** null si el contacto se borró: contact_name dice cómo se llamaba */
  id: string; contact_id: string | null; contact_name: string | null; user_id: string | null; created_at: string
  quote_amount: number | string | null; sale_amount: number | string | null
}
type Contact = { id: string; name: string; company: string | null; commercial_status: string }
export type QuoteStatus = QuoteOutcome

const CHUNK = 200

/**
 * GET /api/data/commercial/summary/detail?kind=quoted|sold&period=…(filtros de Reportes)
 * — lo que hay detrás de las tarjetas «Cotizado» y «Vendido» de Reportes ›
 * Desempeño: cada cotización o venta del periodo, con el cliente, quién la
 * registró y el monto. Usa los mismos filtros y deja fuera las mismas cuentas
 * de prueba que /summary, así que la suma cuadra con la tarjeta. El vendedor
 * solo ve lo suyo.
 *
 * Una cotización está «ganada» si después hubo una venta a ese cliente,
 * «perdida» si el cliente quedó como no interesado o por depurar, y si no,
 * «abierta».
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ feature: 'reports' })
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const f = parseFilters(sp)
  const kind = sp.get('kind')
  if (kind !== 'quoted' && kind !== 'sold') return jsonError('Tipo inválido')
  const column = kind === 'quoted' ? 'quote_amount' : 'sale_amount'

  const calendar = storeDays(ctx)
  const range = resolveRange(f, calendar.today)
  if (!range) return jsonError('Elige un rango de fechas válido, de hasta un año')
  const { from, to, end } = range

  try {
    const supabase = getServerSupabase()
    const [withValue, names] = await Promise.all([
      // Igual que la tarjeta: sin las cuentas de prueba
      reportActivities<Activity>(ctx, f, {
        columns: 'id, contact_id, contact_name, user_id, quote_amount, sale_amount, created_at',
        range: calendar.days(from, end), newestFirst: true, withValue: column,
      }),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
    ])
    // …y sin montos en cero
    const rows = withValue.filter(r => Number(r[column]) > 0)

    // Cotizado: cómo terminó cada una; vendido: solo los nombres de los clientes
    let contacts = new Map<string, Contact>()
    let outcome = new Map<string, QuoteStatus>()
    if (kind === 'quoted') {
      ({ contacts, outcome } = await quoteOutcomes(ctx, rows, calendar.startOf(from)))
    } else {
      const ids = liveContactIds(rows)
      for (let i = 0; i < ids.length; i += CHUNK) {
        const found = await fetchPaged<Contact>((f, t) => supabase.from('contacts').select('id, name, company, commercial_status')
          .eq('store_id', ctx.storeId).in('id', ids.slice(i, i + CHUNK)).order('id', { ascending: true }).range(f, t), 5000)
        for (const c of found) contacts.set(c.id, c)
      }
    }

    const items = rows.map(r => {
      const c = r.contact_id ? contacts.get(r.contact_id) : undefined
      const status = kind === 'quoted' ? outcome.get(r.id) : undefined
      return {
        id: r.id,
        contact_id: r.contact_id,
        client: c ? (c.company?.trim() || c.name) : activityClient(r, new Map()),
        exists: !!c,
        user_id: r.user_id,
        seller: r.user_id ? (names.get(r.user_id) ?? 'Usuario') : 'Sin vendedor',
        amount: Number(r[column]),
        at: r.created_at,
        status,
      }
    })

    return NextResponse.json({
      kind, period: f.period, from, to, end,
      total: items.reduce((s, i) => s + i.amount, 0),
      items,
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/summary/detail', error, 'Error al obtener el detalle')
  }
}
