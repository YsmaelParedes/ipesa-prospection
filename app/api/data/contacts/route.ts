import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { CONTACT_COLUMNS, duplicateContactMessage, linkWhatsAppMessages, parseContact } from '@/lib/contacts'

const MAX_BULK = 500

// GET /api/data/contacts — base de contactos de la tienda (compartida por su equipo)
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const { data, error } = await getServerSupabase()
    .from('contacts')
    .select(CONTACT_COLUMNS)
    .eq('store_id', ctx.storeId)
    .order('created_at', { ascending: false })
  if (error) return serverError('GET /api/data/contacts', error, 'Error al obtener contactos')
  return NextResponse.json({ contacts: data })
}

/**
 * POST /api/data/contacts
 *  - Un objeto → crea un contacto.
 *  - { contacts: [...] } → importación masiva (hasta 500 por petición). Los
 *    teléfonos ya registrados se omiten en vez de fallar todo el lote.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const supabase = getServerSupabase()

  if (Array.isArray(body.contacts)) {
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

    const { data, error } = await supabase
      .from('contacts')
      .upsert(rows, { onConflict: 'store_id,phone', ignoreDuplicates: true })
      .select('id, phone')
    if (error) return serverError('POST /api/data/contacts (bulk)', error, 'Error al importar contactos')

    const inserted = data?.length ?? 0
    if (inserted) await linkWhatsAppMessages(ctx.storeId, data!)
    return NextResponse.json({ inserted, duplicates: rows.length - inserted, invalid })
  }

  const parsed = parseContact(body)
  if (!parsed.ok) return jsonError(parsed.error)

  const { data, error } = await supabase.from('contacts').insert([{ ...parsed.data, store_id: ctx.storeId }]).select(CONTACT_COLUMNS)
  if (error) {
    if (error.code === '23505') return jsonError(duplicateContactMessage(error.message))
    return serverError('POST /api/data/contacts', error, 'Error al crear contacto')
  }
  await linkWhatsAppMessages(ctx.storeId, data ?? [])
  return NextResponse.json(data)
}

// DELETE /api/data/contacts — borrado masivo { ids: string[] }
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore({ write: true })
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
