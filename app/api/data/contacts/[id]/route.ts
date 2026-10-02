import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { CONTACT_COLUMNS, duplicateContactMessage, linkWhatsAppMessages, parseContact } from '@/lib/contacts'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Contacto no encontrado', 404)

  const { data, error } = await getServerSupabase().from('contacts').select(CONTACT_COLUMNS).eq('id', id).maybeSingle()
  if (error) return serverError('GET /api/data/contacts/[id]', error, 'Error al obtener contacto')
  if (!data) return jsonError('Contacto no encontrado', 404)
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Contacto no encontrado', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const parsed = parseContact(body, true)
  if (!parsed.ok) return jsonError(parsed.error)

  // Opt-out de campañas de WhatsApp (se puede cambiar desde la ficha o el chat)
  const updates: Record<string, unknown> = { ...parsed.data }
  if (typeof body.wa_opt_out === 'boolean') {
    updates.wa_opt_out = body.wa_opt_out
    updates.wa_opt_out_at = body.wa_opt_out ? new Date().toISOString() : null
  }
  if (Object.keys(updates).length === 0) return jsonError('No se proporcionaron campos válidos para actualizar')

  const { data, error } = await getServerSupabase()
    .from('contacts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(CONTACT_COLUMNS)
  if (error) {
    if (error.code === '23505') return jsonError(duplicateContactMessage(error.message))
    return serverError('PUT /api/data/contacts/[id]', error, 'Error al actualizar contacto')
  }
  if (!data?.length) return jsonError('Contacto no encontrado', 404)
  if ('phone' in updates) await linkWhatsAppMessages(data)
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Contacto no encontrado', 404)

  const { error } = await getServerSupabase().from('contacts').delete().eq('id', id)
  if (error) return serverError('DELETE /api/data/contacts/[id]', error, 'Error al eliminar contacto')
  return NextResponse.json({ success: true })
}
