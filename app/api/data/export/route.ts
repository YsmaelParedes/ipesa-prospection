import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { CONTACT_COLUMNS } from '@/lib/contacts'
import { jsonError, serverError } from '@/lib/validation'

/**
 * GET /api/data/export?part=<parte>&from=<n> — toda la información de la
 * tienda, por partes de EXPORT_PAGE filas (una respuesta de Vercel no puede
 * pasar de 4.5 MB): el navegador pide página por página y arma el Excel.
 * EXPORT_PAGE no puede pasar de 1000: Supabase corta ahí cada consulta y una
 * página corta se tomaría como la última.
 * Solo dueño/administrador. Funciona también en solo lectura (es consulta):
 * así una tienda que cancela o vence puede llevarse su información.
 */
const EXPORT_PAGE = 1000

const PARTS = {
  contacts:   { table: 'contacts',        columns: CONTACT_COLUMNS, order: 'created_at' },
  leads:      { table: 'leads',           columns: 'id, name, phone, email, canal, segmento, estado, monto, notas, fecha, created_at, user_id', order: 'created_at' },
  activities: { table: 'lead_activities', columns: 'id, lead_id, type, description, amount, activity_date, user_id', order: 'activity_date' },
  reminders:  { table: 'reminders',       columns: 'id, lead_id, lead_name, nota, reminder_date, type, completado, completado_at, user_id', order: 'reminder_date' },
  catalogs:   { table: 'app_config',      columns: 'id, type, label', order: 'type' },
} as const
type Part = keyof typeof PARTS

async function GETImpl(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const part = req.nextUrl.searchParams.get('part') as Part | null
  if (!part || !(part in PARTS)) return jsonError('Parte inválida')
  const from = Number(req.nextUrl.searchParams.get('from') ?? 0)
  if (!Number.isInteger(from) || from < 0 || from > 1_000_000) return jsonError('Página inválida')

  const { table, columns, order } = PARTS[part]
  try {
    const db = getServerSupabase()
    const needsNames = part === 'leads' || part === 'activities' || part === 'reminders'
    const [{ data, error }, names] = await Promise.all([
      db.from(table).select(columns).eq('store_id', ctx.storeId)
        .order(order, { ascending: true }).order('id', { ascending: true })
        .range(from, from + EXPORT_PAGE - 1),
      needsNames ? getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()) : Promise.resolve(null),
    ])
    if (error) throw error
    // Nombre de la persona en vez de su id interno (el id no sale de la tienda)
    const rows = (data ?? []).map((r: any) => {
      if (!names) return r
      const { user_id, ...rest } = r
      return { ...rest, user_name: user_id ? names.get(user_id) ?? 'Otro usuario' : '' }
    })
    return NextResponse.json(
      { rows, next: rows.length === EXPORT_PAGE ? from + EXPORT_PAGE : null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return serverError('GET /api/data/export', error, 'No se pudo exportar la información')
  }
}

export const GET = withServerTiming(GETImpl)
