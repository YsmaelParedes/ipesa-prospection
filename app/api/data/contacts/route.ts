import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { CONTACT_COLUMNS, duplicateContactMessage, linkWhatsAppMessages, parseContact } from '@/lib/contacts'
import { fetchPaged } from '@/lib/paged'
import { parsePlanLimitError, planLimitMessage, planLimitResponse, remainingSlots } from '@/lib/planLimits'
import { planOf } from '@/lib/stores'
import { normalizePhone } from '@/lib/phone'
import { isPhoneFilter } from '@/lib/lineType'
import { withContactSearch } from '@/lib/contactSearch'

const MAX_BULK = 500

const PAGE = 50
const MAX_PAGE = 200
/** Columnas para buscar o elegir un contacto (buscador, recordatorios, campañas, bandeja). */
const LITE_COLUMNS = 'id, name, phone, email, company, segment, acquisition_channel, zone, wa_opt_out, line_type, commercial_status'

/**
 * GET /api/data/contacts — la base de la tienda, de a poco:
 *  · Lista (Contactos): ?offset=&limit= (50 por página) con filtros ?q=, ?segment=,
 *    ?channel=, ?zone=, ?line=whatsapp|fijo|sin_verificar|sin_telefono. Devuelve
 *    { contacts, total } y, con ?facets=1, los conteos de toda la base para los filtros.
 *  · Búsqueda rápida: ?q=…&fields=lite&limit=8 (buscador, recordatorios, bandeja); con
 *    ?prefix=1 solo los que empiezan con la primera palabra.
 *  · Duplicado: ?phone=2221234567 → el contacto con ese número, si existe.
 *  · Campañas: ?fields=lite&all=1&line=con_telefono → todos los que tienen teléfono, columnas mínimas.
 *  · Exportar (administradores): ?all=1 con los mismos filtros → todo, con todas las columnas.
 */
async function GETImpl(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const sp = req.nextUrl.searchParams
  const lite = sp.get('fields') === 'lite'
  const columns = lite ? LITE_COLUMNS : CONTACT_COLUMNS
  const supabase = getServerSupabase()

  try {
    const phone = sp.get('phone')
    if (phone !== null) {
      const p = normalizePhone(phone)
      if (p.length !== 10) return NextResponse.json({ contacts: [], total: 0 })
      const { data, error } = await supabase.from('contacts').select(columns).eq('store_id', ctx.storeId).eq('phone', p).limit(1)
      if (error) throw error
      return NextResponse.json({ contacts: data ?? [], total: data?.length ?? 0 })
    }

    // Filtros comunes a la lista y a "todos" (el tipo del constructor de consultas se conserva)
    const filtered = <Q,>(query: Q): Q => {
      let r = query as any
      for (const [param, column] of [['segment', 'segment'], ['channel', 'acquisition_channel'], ['zone', 'zone']] as const) {
        const v = sp.get(param)
        if (v) r = r.eq(column, v.slice(0, 100))
      }
      const line = sp.get('line')
      if (line === 'sin_telefono') r = r.is('phone', null)
      else if (line === 'con_telefono') r = r.not('phone', 'is', null)
      else if (line === 'sin_verificar') r = r.not('phone', 'is', null).is('line_type', null)
      else if (isPhoneFilter(line)) r = r.not('phone', 'is', null).eq('line_type', line)
      return withContactSearch(r, sp.get('q'), { prefix: sp.get('prefix') === '1' })
    }

    if (sp.get('all') === '1') {
      // Completo (todas las columnas) solo para exportar: administradores
      if (!lite && !ctx.isAdmin) return jsonError('Solo un administrador puede exportar contactos', 403)
      const contacts = await fetchPaged((from, to) => filtered(supabase.from('contacts').select(columns).eq('store_id', ctx.storeId))
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to), 100000)
      return NextResponse.json({ contacts, total: contacts.length })
    }

    const limit = Math.max(1, Math.min(Number(sp.get('limit')) || PAGE, MAX_PAGE))
    const offset = Math.max(0, Math.min(Number(sp.get('offset')) || 0, 1_000_000))
    const [list, facets] = await Promise.all([
      filtered(supabase.from('contacts').select(columns, { count: 'exact' }).eq('store_id', ctx.storeId))
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1),
      sp.get('facets') === '1' ? supabase.rpc('contact_facets', { p_store: ctx.storeId }) : Promise.resolve(null),
    ])
    if (list.error) throw list.error
    if (facets?.error) throw facets.error
    return NextResponse.json({ contacts: list.data ?? [], total: list.count ?? 0, ...(facets ? { facets: facets.data } : {}) })
  } catch (error) {
    return serverError('GET /api/data/contacts', error, 'Error al obtener contactos')
  }
}

/**
 * POST /api/data/contacts
 *  - Un objeto → crea un contacto.
 *  - { contacts: [...] } → importación masiva (hasta 500 por petición; solo
 *    administrador). Los teléfonos ya registrados se omiten en vez de
 *    fallar todo el lote.
 * En el plan Litro (máximo de contactos) la importación se recorta a los
 * lugares que quedan; la base hace cumplir el límite de todas formas.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const supabase = getServerSupabase()

  if (Array.isArray(body.contacts)) {
    // Importar listas: solo administrador
    if (!ctx.isAdmin) return jsonError('Solo un administrador puede importar contactos', 403)
    const list = body.contacts as unknown[]
    if (list.length === 0 || list.length > MAX_BULK) return jsonError(`Se permiten de 1 a ${MAX_BULK} contactos por petición`)

    const rows: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let invalid = 0
    for (const item of list) {
      const parsed = item && typeof item === 'object' ? parseContact(item as Record<string, unknown>, false, { requirePhone: true }) : null
      if (!parsed || !parsed.ok) { invalid++; continue }
      const phone = parsed.data.phone as string
      if (seen.has(phone)) { invalid++; continue }
      seen.add(phone)
      rows.push({ ...parsed.data, store_id: ctx.storeId })
    }
    if (!rows.length) return NextResponse.json({ inserted: 0, duplicates: 0, invalid })

    // Plan con límite: quitar los que ya existen y recortar a los lugares libres
    const limit = planOf(ctx.plan).maxContacts
    let toInsert = rows
    let duplicates = 0
    let overLimit = 0
    if (limit !== null) {
      const [{ count, error: countError }, { data: existing, error: existingError }] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('store_id', ctx.storeId),
        supabase.from('contacts').select('phone').eq('store_id', ctx.storeId).in('phone', rows.map(r => r.phone as string)),
      ])
      if (countError || existingError) return serverError('POST /api/data/contacts (bulk)', countError ?? existingError, 'Error al importar contactos')
      const known = new Set((existing ?? []).map(e => e.phone as string))
      const fresh = rows.filter(r => !known.has(r.phone as string))
      duplicates = rows.length - fresh.length
      const free = remainingSlots(limit, count ?? 0) ?? fresh.length
      toInsert = fresh.slice(0, free)
      overLimit = fresh.length - toInsert.length
      if (!toInsert.length) {
        return NextResponse.json({ inserted: 0, duplicates, invalid, overLimit, limitMessage: overLimit ? planLimitMessage('contacts', limit) : undefined })
      }
    }

    const { data, error } = await supabase
      .from('contacts')
      .upsert(toInsert, { onConflict: 'store_id,phone', ignoreDuplicates: true })
      .select('id, phone')
    if (error) {
      const hit = parsePlanLimitError(error)
      if (hit) return planLimitResponse(hit.kind, hit.limit)
      return serverError('POST /api/data/contacts (bulk)', error, 'Error al importar contactos')
    }

    const inserted = data?.length ?? 0
    if (inserted) await linkWhatsAppMessages(ctx.storeId, data!)
    return NextResponse.json({
      inserted, duplicates: duplicates + toInsert.length - inserted, invalid,
      ...(overLimit ? { overLimit, limitMessage: planLimitMessage('contacts', limit!) } : {}),
    })
  }

  const parsed = parseContact(body)
  if (!parsed.ok) return jsonError(parsed.error)

  // Responsable en el sistema comercial: quien lo da de alta (los importados quedan sin asignar).
  // El administrador puede elegir a otra persona activa del equipo, o dejarlo sin asignar (null).
  let ownerId: string | null = ctx.uid
  if (ctx.isAdmin && 'owner_id' in body && body.owner_id !== ctx.uid) {
    if (body.owner_id === null) ownerId = null
    else if (!isUUID(body.owner_id)) return jsonError('Responsable inválido')
    else {
      const { data: member } = await supabase.from('store_members').select('user_id')
        .eq('store_id', ctx.storeId).eq('user_id', body.owner_id).eq('status', 'active').maybeSingle()
      if (!member) return jsonError('Esa persona no está activa en el equipo')
      ownerId = body.owner_id
    }
  }
  // Observaciones del alta de prospecto: quedan como primera nota de su historial comercial
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note.length > 2000) return jsonError('Las observaciones exceden 2000 caracteres')

  const { data, error } = await supabase.from('contacts')
    .insert([{ ...parsed.data, store_id: ctx.storeId, owner_id: ownerId, ...(note ? { last_note: note } : {}) }])
    .select(CONTACT_COLUMNS)
  if (error) {
    if (error.code === '23505') return jsonError(duplicateContactMessage(error.message))
    const hit = parsePlanLimitError(error)
    if (hit) return planLimitResponse(hit.kind, hit.limit)
    return serverError('POST /api/data/contacts', error, 'Error al crear contacto')
  }
  await linkWhatsAppMessages(ctx.storeId, data ?? [])
  if (note && data?.[0]) {
    const { error: noteError } = await supabase.from('commercial_activities')
      .insert({ store_id: ctx.storeId, contact_id: data[0].id, user_id: ctx.uid, kind: 'nota', note })
    if (noteError) console.error('[POST /api/data/contacts] nota inicial', noteError)
  }
  return NextResponse.json(data)
}

// DELETE /api/data/contacts — borrado masivo { ids: string[] }
// Borrar contactos: solo administrador (los vendedores no borran la base)
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  const ids = body?.ids
  if (!Array.isArray(ids) || ids.length === 0) return jsonError('ids debe ser un array no vacío')
  if (ids.length > MAX_BULK) return jsonError(`Se permite eliminar máximo ${MAX_BULK} contactos a la vez`)
  if (!ids.every(isUUID)) return jsonError('ids inválidos')

  const { error } = await getServerSupabase().from('contacts').delete().eq('store_id', ctx.storeId).in('id', ids)
  if (error) return serverError('DELETE /api/data/contacts', error, 'Error al eliminar contactos')
  return NextResponse.json({ success: true, deleted: ids.length })
}

export const GET = withServerTiming(GETImpl)
