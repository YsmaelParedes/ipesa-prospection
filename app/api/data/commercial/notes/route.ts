import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { jsonError, readJson, serverError } from '@/lib/validation'
import { hasSalesTeam, salesTeamRequired } from '@/lib/commercialServer'
import { todayISO } from '@/lib/commercial'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const validDate = (d: string) => DATE_RE.test(d) && !Number.isNaN(Date.parse(d))

/**
 * GET /api/data/commercial/notes?date=AAAA-MM-DD — observaciones del día.
 * Vendedor: la suya. Dueño/administrador: las de todo el equipo.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const date = req.nextUrl.searchParams.get('date') || todayISO(ctx.store.timezone)
  if (!validDate(date)) return jsonError('Fecha inválida')

  let q = getServerSupabase().from('commercial_daily_notes').select('user_id, note, updated_at')
    .eq('store_id', ctx.storeId).eq('day', date)
  if (!ctx.isAdmin) q = q.eq('user_id', ctx.uid)
  const { data, error } = await q
  if (error) return serverError('GET /api/data/commercial/notes', error, 'No se pudieron cargar las observaciones')
  return NextResponse.json({ date, notes: data ?? [] })
}

/** PUT /api/data/commercial/notes { date, note } — cada quien escribe solo la suya (vacía = se borra). */
export async function PUT(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const body = await readJson(req)
  const date = typeof body?.date === 'string' ? body.date : ''
  const note = typeof body?.note === 'string' ? body.note.trim() : null
  if (!validDate(date)) return jsonError('Fecha inválida')
  if (note === null) return jsonError('Escribe la observación')
  if (note.length > 2000) return jsonError('La observación excede 2000 caracteres')

  const table = getServerSupabase().from('commercial_daily_notes')
  const { error } = note
    ? await table.upsert({ store_id: ctx.storeId, user_id: ctx.uid, day: date, note, updated_at: new Date().toISOString() }, { onConflict: 'store_id,user_id,day' })
    : await table.delete().eq('store_id', ctx.storeId).eq('user_id', ctx.uid).eq('day', date)
  if (error) return serverError('PUT /api/data/commercial/notes', error, 'No se pudo guardar la observación')
  return NextResponse.json({ date, note })
}
