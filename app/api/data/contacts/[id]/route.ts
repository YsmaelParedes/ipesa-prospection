import { withServerTiming } from '@/lib/serverTiming'
import { ensureZone } from '@/lib/zonesServer'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore, type StoreContext } from '@/lib/supabase-server'
import { storeDays } from '@/lib/storeActivity'
import { isEffective } from '@/lib/commercial'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { CONTACT_COLUMNS, duplicateContactMessage, linkWhatsAppMessages, parseContact } from '@/lib/contacts'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Lo que cambia en el sistema comercial cuando a un contacto con «Número
 * incorrecto» le corrigen el teléfono: sale de ese estado y queda para
 * llamarle hoy (Contactado si ya hubo una conversación; si no, Prospecto).
 */
async function reopenAfterPhoneFix(ctx: StoreContext, contactId: string) {
  const { data } = await getServerSupabase().from('commercial_activities').select('result')
    .eq('store_id', ctx.storeId).eq('contact_id', contactId).not('result', 'is', null)
  const talked = (data ?? []).some(a => isEffective(a.result as string))
  return {
    commercial_status: talked ? 'contactado' : 'nuevo',
    next_action: 'Llamar al número corregido',
    next_action_at: storeDays(ctx).today,
    no_answer_streak: 0,
  }
}

async function GETImpl(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Contacto no encontrado', 404)

  const { data, error } = await getServerSupabase().from('contacts').select(CONTACT_COLUMNS).eq('id', id).eq('store_id', ctx.storeId).maybeSingle()
  if (error) return serverError('GET /api/data/contacts/[id]', error, 'Error al obtener contacto')
  if (!data) return jsonError('Contacto no encontrado', 404)
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
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
  // Zona escrita con «Otra…»: se agrega a las zonas de la tienda (o se usa la que ya existe)
  if (typeof updates.zone === 'string' && updates.zone.trim()) {
    try { updates.zone = await ensureZone(ctx.storeId, updates.zone) }
    catch (error) { return serverError('PUT /api/data/contacts/[id] (zona)', error, 'No se pudo guardar la zona') }
  }

  if ('phone' in updates || 'address' in updates) {
    const { data: prev } = await getServerSupabase().from('contacts').select('phone, address, commercial_status').eq('id', id).eq('store_id', ctx.storeId).maybeSingle()
    if (prev) {
      // Sin teléfono tiene que quedar la dirección para visitarlo
      const phone = 'phone' in updates ? updates.phone : prev.phone
      const address = String(('address' in updates ? updates.address : prev.address) ?? '').trim()
      if (!phone && !address) return jsonError('Escribe el teléfono o, si no tiene, la dirección para visitarlo')
      const newPhone = 'phone' in updates && prev.phone !== updates.phone
      // Número nuevo: lo que se sabía del anterior (WhatsApp o fijo) ya no aplica
      if (newPhone && !('line_type' in updates)) updates.line_type = null
      // Tenía «Número incorrecto» y ya le pusieron otro: vuelve a la lista de hoy
      // de su responsable, como Contactado si alguna vez se habló con él o como Prospecto
      if (newPhone && updates.phone && prev.commercial_status === 'depurar') {
        Object.assign(updates, await reopenAfterPhoneFix(ctx, id))
      }
    }
  }

  const { data, error } = await getServerSupabase()
    .from('contacts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('store_id', ctx.storeId)
    .select(CONTACT_COLUMNS)
  if (error) {
    if (error.code === '23505') return jsonError(duplicateContactMessage(error.message))
    return serverError('PUT /api/data/contacts/[id]', error, 'Error al actualizar contacto')
  }
  if (!data?.length) return jsonError('Contacto no encontrado', 404)
  if ('phone' in updates) await linkWhatsAppMessages(ctx.storeId, data)
  return NextResponse.json(data)
}

// Solo administrador: los vendedores no borran contactos
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx

  const { id } = await params
  if (!isUUID(id)) return jsonError('Contacto no encontrado', 404)

  const { error } = await getServerSupabase().from('contacts').delete().eq('id', id).eq('store_id', ctx.storeId)
  if (error) return serverError('DELETE /api/data/contacts/[id]', error, 'Error al eliminar contacto')
  return NextResponse.json({ success: true })
}

export const GET = withServerTiming(GETImpl)
