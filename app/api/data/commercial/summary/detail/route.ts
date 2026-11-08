import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getTestUserIds, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { jsonError, serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { hasSalesTeam, salesTeamRequired, zonedDayStart } from '@/lib/commercialServer'
import { addDays, periodRange, todayISO, type Period } from '@/lib/commercial'

type Activity = {
  id: string; contact_id: string; user_id: string | null; created_at: string
  quote_amount: number | string | null; sale_amount: number | string | null
}
type Contact = { id: string; name: string; company: string | null; commercial_status: string }
export type QuoteStatus = 'abierta' | 'ganada' | 'perdida'

const MAX_OFFSET = 400
const CHUNK = 200
const LOST = new Set(['no_interesado', 'depurar'])

/**
 * GET /api/data/commercial/summary/detail?period=day|week|month&offset=0&kind=quoted|sold
 * — lo que hay detrás de las tarjetas «Cotizado» y «Vendido» del Acumulado
 * (solo administradores): cada cotización o venta del periodo, con el cliente,
 * quién la registró y el monto. Usa el mismo periodo y deja fuera las mismas
 * cuentas de prueba que /summary, así que la suma cuadra con la tarjeta.
 *
 * Una cotización está «ganada» si después hubo una venta a ese cliente,
 * «perdida» si el cliente quedó como no interesado o por depurar, y si no,
 * «abierta».
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const sp = req.nextUrl.searchParams
  const period = (sp.get('period') || 'week') as Period
  if (period !== 'day' && period !== 'week' && period !== 'month') return jsonError('Periodo inválido')
  const offset = Number(sp.get('offset') ?? 0)
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) return jsonError('Periodo fuera de rango')
  const kind = sp.get('kind')
  if (kind !== 'quoted' && kind !== 'sold') return jsonError('Tipo inválido')
  const column = kind === 'quoted' ? 'quote_amount' : 'sale_amount'

  const tz = ctx.store.timezone || 'America/Mexico_City'
  const today = todayISO(tz)
  const { from, to } = periodRange(period, today, offset)
  const end = to > today ? today : to

  try {
    const supabase = getServerSupabase()
    const [allRows, names, tests] = await Promise.all([
      fetchPaged<Activity>((f, t) => supabase.from('commercial_activities')
        .select('id, contact_id, user_id, quote_amount, sale_amount, created_at')
        .eq('store_id', ctx.storeId)
        .not(column, 'is', null)
        .gte('created_at', zonedDayStart(from, tz).toISOString())
        .lt('created_at', zonedDayStart(addDays(end, 1), tz).toISOString())
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(f, t), 200000),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
      getTestUserIds(ctx.storeId),
    ])
    // Igual que la tarjeta: sin las cuentas de prueba y sin montos en cero
    const rows = allRows.filter(r => (!r.user_id || !tests.has(r.user_id)) && Number(r[column]) > 0)

    const ids = [...new Set(rows.map(r => r.contact_id))]
    const contacts = new Map<string, Contact>()
    // Para el estado de cada cotización: la venta más reciente de cada cliente
    const lastSale = new Map<string, string>()
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK)
      const [found, sales] = await Promise.all([
        fetchPaged<Contact>((f, t) => supabase.from('contacts').select('id, name, company, commercial_status')
          .eq('store_id', ctx.storeId).in('id', part).order('id', { ascending: true }).range(f, t), 5000),
        kind === 'quoted'
          ? fetchPaged<{ contact_id: string; created_at: string }>((f, t) => supabase.from('commercial_activities')
            .select('contact_id, created_at').eq('store_id', ctx.storeId).in('contact_id', part)
            .not('sale_amount', 'is', null).gte('created_at', zonedDayStart(from, tz).toISOString())
            .order('created_at', { ascending: false }).order('id', { ascending: false }).range(f, t), 200000)
          : Promise.resolve([]),
      ])
      for (const c of found) contacts.set(c.id, c)
      for (const s of sales) if (!lastSale.has(s.contact_id)) lastSale.set(s.contact_id, s.created_at)
    }

    const items = rows.map(r => {
      const c = contacts.get(r.contact_id)
      let status: QuoteStatus | undefined
      if (kind === 'quoted') {
        const sale = lastSale.get(r.contact_id)
        status = sale && sale >= r.created_at ? 'ganada' : c && LOST.has(c.commercial_status) ? 'perdida' : 'abierta'
      }
      return {
        id: r.id,
        contact_id: r.contact_id,
        client: c ? (c.company?.trim() || c.name) : 'Cliente borrado',
        exists: !!c,
        user_id: r.user_id,
        seller: r.user_id ? (names.get(r.user_id) ?? 'Usuario') : 'Sin vendedor',
        amount: Number(r[column]),
        at: r.created_at,
        status,
      }
    })

    return NextResponse.json({
      kind, period, offset, from, to, end,
      total: items.reduce((s, i) => s + i.amount, 0),
      items,
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/summary/detail', error, 'Error al obtener el detalle')
  }
}
