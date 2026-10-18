import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { CONTACT_COLUMNS, duplicateContactMessage, linkWhatsAppMessages, parseContact } from '@/lib/contacts'
import { fetchPaged } from '@/lib/paged'
import { parsePlanLimitError, planLimitMessage, planLimitResponse, remainingSlots } from '@/lib/planLimits'
import { planOf } from '@/lib/stores'

const MAX_BULK = 500

// GET /api/data/contacts — base de contactos de la tienda (compartida por su equipo), completa
async function GETImpl() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  try {
    const contacts = await fetchPaged((from, to) => getServerSupabase()
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('store_id', ctx.storeId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(from, to), 100000)
    return NextResponse.json({ contacts })
  } catch (error) {
    return serverError('GET /api/data/contacts', error, 'Error al obtener contactos')
  }
}

/**
 * POST /api/data/contacts
 *  - Un objeto → crea un contacto.
 *  - { contacts: [...] } → importación masiva (hasta 500 por petición; solo
 *    dueño/administrador). Los teléfonos ya registrados se omiten en vez de
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
    // Importar listas: solo dueño/administrador
    if (!ctx.isAdmin) return jsonError('Solo el dueño o un administrador puede importar contactos', 403)
    const list = body.contacts as unknown[]
    if (list.length === 0 || list.length > MAX_BULK) return jsonError(`Se permiten de 1 a ${MAX_BULK} contactos por petición`)

    const rows: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let invalid = 0
    for (const item of list) {
      const parsed = item && typeof item === 'object' ? parseContact(item as Record<string, unknown>) : null
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

  const { data, error } = await supabase.from('contacts').insert([{ ...parsed.data, store_id: ctx.storeId }]).select(CONTACT_COLUMNS)
  if (error) {
    if (error.code === '23505') return jsonError(duplicateContactMessage(error.message))
    const hit = parsePlanLimitError(error)
    if (hit) return planLimitResponse(hit.kind, hit.limit)
    return serverError('POST /api/data/contacts', error, 'Error al crear contacto')
  }
  await linkWhatsAppMessages(ctx.storeId, data ?? [])
  return NextResponse.json(data)
}

// DELETE /api/data/contacts — borrado masivo { ids: string[] }
// Borrar contactos: solo dueño/administrador (los vendedores no borran la base)
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
