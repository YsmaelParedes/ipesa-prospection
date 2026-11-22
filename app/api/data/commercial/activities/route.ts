import { NextRequest, NextResponse } from 'next/server'
import { storeDays } from '@/lib/storeActivity'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, rpcUserError, serverError, type Schema } from '@/lib/validation'
import { ACTIVITY_COLUMNS, COMMERCIAL_COLUMNS, activityClient, getVisibleContact, liveContactIds } from '@/lib/commercialServer'
import { ACTIVITY_KINDS, COMMERCIAL_STATUSES, EMAIL_RESULT_CHOICES, RESULTS } from '@/lib/commercial'
import { addDaysIso, type SendVia } from '@/lib/quotes'
import { clientFromContact, getQuoteSettings, storeToday } from '@/lib/quotesServer'
import { insertUploadedQuote, removeQuoteFile, verifyQuoteFile, type QuoteFile } from '@/lib/quoteFilesServer'

const LOG_LIMIT = 500
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/data/commercial/activities?contact_id=uuid — historial del contacto.
 * GET /api/data/commercial/activities?from=AAAA-MM-DD&to=AAAA-MM-DD[&user=&kind=&result=]
 *   — bitácora de actividades (hasta 500, las más recientes). Vendedor: solo
 *   las suyas. administrador: el equipo o una persona.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const contactId = sp.get('contact_id')
  const supabase = getServerSupabase()

  if (contactId !== null) {
    if (!isUUID(contactId)) return jsonError('contact_id inválido')
    if (!(await getVisibleContact(ctx, contactId))) return jsonError('Contacto no encontrado', 404)
    try {
      const [{ data, error }, changes, names] = await Promise.all([
        supabase.from('commercial_activities').select(ACTIVITY_COLUMNS)
          .eq('store_id', ctx.storeId).eq('contact_id', contactId)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200),
        // Cambios de fecha, montos corregidos y actividades borradas (no son actividades)
        supabase.from('commercial_events').select('id, user_id, kind, detail, created_at')
          .eq('store_id', ctx.storeId).eq('contact_id', contactId)
          .order('created_at', { ascending: false }).limit(200),
        getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
      ])
      if (error) throw error
      const who = (uid: string | null) => (uid ? (names.get(uid) ?? 'Usuario') : null)
      const activities = (data ?? []).map(a => ({ ...a, user_name: who(a.user_id) }))
      const events = (changes.error ? [] : changes.data ?? []).map(e => ({ id: e.id, kind: e.kind, detail: e.detail, created_at: e.created_at, user_name: who(e.user_id) }))
      return NextResponse.json({ activities, events })
    } catch (error) {
      return serverError('GET /api/data/commercial/activities', error, 'Error al obtener el historial')
    }
  }

  const calendar = storeDays(ctx)
  const from = sp.get('from') || calendar.today
  const to = sp.get('to') || from
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || to < from) {
    return jsonError('Rango de fechas inválido')
  }
  const user = sp.get('user')
  if (user && !isUUID(user)) return jsonError('Persona inválida')
  const kind = sp.get('kind')
  if (kind && !(ACTIVITY_KINDS as readonly string[]).includes(kind)) return jsonError('Tipo inválido')
  const result = sp.get('result')
  if (result && !(RESULTS as readonly string[]).includes(result)) return jsonError('Resultado inválido')
  const only = ctx.isAdmin ? user : ctx.uid

  const range = calendar.days(from, to)
  try {
    let q = supabase.from('commercial_activities').select(ACTIVITY_COLUMNS).eq('store_id', ctx.storeId)
      .gte('created_at', range.from).lt('created_at', range.to)
    if (only) q = q.eq('user_id', only)
    if (kind) q = q.eq('kind', kind)
    if (result) q = q.eq('result', result)
    const [{ data, error }, names] = await Promise.all([
      q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(LOG_LIMIT),
      getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()),
    ])
    if (error) throw error
    const rows = data ?? []
    const ids = liveContactIds(rows)
    const contactName = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 150) {
      const { data: part } = await supabase.from('contacts').select('id, name, company')
        .eq('store_id', ctx.storeId).in('id', ids.slice(i, i + 150))
      for (const c of part ?? []) contactName.set(c.id, c.company?.trim() || c.name)
    }
    return NextResponse.json({
      truncated: rows.length === LOG_LIMIT,
      activities: rows.map(a => ({
        ...a,
        contact_name: activityClient(a, contactName),
        user_name: a.user_id ? (names.get(a.user_id) ?? 'Usuario') : null,
      })),
    })
  } catch (error) {
    return serverError('GET /api/data/commercial/activities (bitácora)', error, 'Error al obtener las actividades')
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
 * visita, correo o nota y actualiza el contacto en la misma transacción. Quien
 * registra una llamada, WhatsApp o visita se queda con el contacto.
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
  // Los resultados de un correo solo valen para un correo, y un correo solo lleva los suyos
  const emailResult = (EMAIL_RESULT_CHOICES as readonly unknown[]).includes(d.result)
  const emailOnly = emailResult && d.result !== 'cotizacion' && d.result !== 'venta' && d.result !== 'no_interesado'
  if (d.kind !== 'nota' && (d.kind === 'correo' ? !emailResult : emailOnly)) return jsonError('Ese resultado no corresponde al tipo de actividad')

  // «Cotización enviada» con su PDF o foto: el archivo se revisa antes de registrar nada
  const rawFile = body.quote_file && typeof body.quote_file === 'object' ? body.quote_file as { path?: unknown; name?: unknown } : null
  let quoteFile: QuoteFile | null = null
  if (rawFile) {
    if (d.result !== 'cotizacion' || !(Number(d.quote_amount) > 0)) return jsonError('Escribe el monto de la cotización para adjuntarla')
    const checked = await verifyQuoteFile(ctx.storeId, rawFile.path)
    if (!checked.ok) return jsonError(checked.error)
    quoteFile = checked.file
  }

  const supabase = getServerSupabase()
  const { data: activity, error } = await supabase.rpc('log_commercial_activity', {
    p_store: ctx.storeId, p_actor: ctx.uid, p_contact: d.contact_id,
    p_kind: d.kind, p_result: d.kind === 'nota' ? null : d.result, p_note: d.note ?? null,
    p_quote: d.quote_amount ?? null, p_sale: d.sale_amount ?? null,
    p_next_action: d.next_action ?? null, p_next_at: d.next_action_at ?? null,
    p_status: d.status ?? null, p_claim: true,
  })
  if (error) {
    if (quoteFile) await removeQuoteFile(quoteFile.path)
    const known = rpcUserError(error)
    if (known) return jsonError(known.message, known.status)
    return serverError('POST /api/data/commercial/activities', error, 'No se pudo registrar la actividad')
  }

  // La cotización subida queda ligada a esta actividad (no registra otra)
  let quoteError = false
  if (quoteFile) {
    try {
      const contactId = d.contact_id as string
      const [client, settings] = await Promise.all([clientFromContact(ctx.storeId, contactId), getQuoteSettings(ctx.storeId)])
      await insertUploadedQuote(ctx, {
        file: quoteFile,
        fileName: typeof rawFile?.name === 'string' && rawFile.name.trim() ? rawFile.name : 'Cotizacion',
        client: client ?? { contact_id: contactId, client_name: 'Cliente', client_phone: '', client_email: '' },
        total: Number(d.quote_amount),
        validUntil: addDaysIso(storeToday(ctx), settings.validDays),
        sent: { via: VIA_BY_KIND[d.kind as string] ?? null, activityId: (activity as { id: string }).id },
      })
    } catch (e) {
      quoteError = true
      console.error('[POST /api/data/commercial/activities] no se pudo guardar la cotización subida', e)
      await removeQuoteFile(quoteFile.path)
    }
  }

  const { data: contact } = await supabase.from('contacts').select(COMMERCIAL_COLUMNS)
    .eq('id', d.contact_id as string).eq('store_id', ctx.storeId).maybeSingle()
  return NextResponse.json({ activity, contact, ...(quoteError ? { quoteError: true } : {}) })
}

/** Cómo se mandó la cotización, según el tipo de actividad (una llamada no la manda). */
const VIA_BY_KIND: Record<string, SendVia> = { whatsapp: 'whatsapp', correo: 'correo', visita: 'en_persona' }
