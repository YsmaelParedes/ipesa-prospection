import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError, type Schema } from '@/lib/validation'
import { ACTIVITY_COLUMNS, COMMERCIAL_COLUMNS, getVisibleContact } from '@/lib/commercialServer'
import { ACTIVITY_KINDS, COMMERCIAL_STATUSES, RESULTS } from '@/lib/commercial'
import { rpcUserError } from '@/lib/platformEvents'

// GET /api/data/commercial/activities?contact_id=uuid — historial del contacto
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const contactId = req.nextUrl.searchParams.get('contact_id')
  if (!isUUID(contactId)) return jsonError('contact_id inválido')
  if (!(await getVisibleContact(ctx, contactId))) return jsonError('Contacto no encontrado', 404)

  try {
    const [{ data, error }, names] = await Promise.all([
      getServerSupabase().from('commercial_activities').select(ACTIVITY_COLUMNS)
        .eq('store_id', ctx.storeId).eq('contact_id', contactId)
        .order('created_at', { ascending: false }).limit(200),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
    ])
    if (error) throw error
    const activities = (data ?? []).map(a => ({ ...a, user_name: a.user_id ? (names.get(a.user_id) ?? 'Usuario') : null }))
    return NextResponse.json({ activities })
  } catch (error) {
    return serverError('GET /api/data/commercial/activities', error, 'Error al obtener el historial')
  }
}

const ACTIVITY_SCHEMA: Schema = {
  contact_id:     { type: 'uuid', required: true, label: 'Contacto' },
  kind:           { type: 'enum', values: ACTIVITY_KINDS, required: true, label: 'Tipo' },
  result:         { type: 'enum', values: RESULTS, nullable: true, label: 'Resultado' },
  note:           { type: 'text', max: 2000, nullable: true, label: 'Nota' },
  quote_amount:   { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Monto cotizado' },
  sale_amount:    { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Monto vendido' },
  next_action:    { type: 'text', max: 200, nullable: true, label: 'Próxima acción' },
  next_action_at: { type: 'date', nullable: true, label: 'Fecha de la próxima acción' },
  status:         { type: 'enum', values: COMMERCIAL_STATUSES, nullable: true, label: 'Estado' },
}

/**
 * POST /api/data/commercial/activities — registra una llamada, WhatsApp,
 * visita o nota y actualiza el contacto en la misma transacción. Solo el
 * responsable del contacto; el dueño o un administrador también puede tomar
 * uno sin responsable.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, ACTIVITY_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  const d = parsed.data
  if (d.kind !== 'nota' && !d.result) return jsonError('Elige el resultado')
  if (d.kind === 'nota' && !d.note) return jsonError('Escribe la nota')

  const supabase = getServerSupabase()
  const { data: activity, error } = await supabase.rpc('log_commercial_activity', {
    p_store: ctx.storeId, p_actor: ctx.uid, p_contact: d.contact_id,
    p_kind: d.kind, p_result: d.kind === 'nota' ? null : d.result, p_note: d.note ?? null,
    p_quote: d.quote_amount ?? null, p_sale: d.sale_amount ?? null,
    p_next_action: d.next_action ?? null, p_next_at: d.next_action_at ?? null,
    p_status: d.status ?? null, p_claim: ctx.isAdmin,
  })
  if (error) {
    const known = rpcUserError(error)
    if (known) return jsonError(known.message, known.status)
    return serverError('POST /api/data/commercial/activities', error, 'No se pudo registrar la actividad')
  }

  const { data: contact } = await supabase.from('contacts').select(COMMERCIAL_COLUMNS)
    .eq('id', d.contact_id as string).eq('store_id', ctx.storeId).maybeSingle()
  return NextResponse.json({ activity, contact })
}
