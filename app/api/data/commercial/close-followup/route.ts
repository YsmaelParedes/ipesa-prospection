import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { COMMERCIAL_COLUMNS, getVisibleContact } from '@/lib/commercialServer'

/**
 * POST /api/data/commercial/close-followup { contact_id }
 * Cierra el seguimiento pendiente de un contacto: ya no aparece en Hoy ni en
 * la Agenda. Conserva su estado, su responsable y su historial; vuelve al
 * flujo cuando alguien registra una actividad nueva.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  const contactId = body?.contact_id
  if (!isUUID(contactId)) return jsonError('Contacto inválido')
  if (!(await getVisibleContact(ctx, contactId))) return jsonError('Contacto no encontrado', 404)

  const { data, error } = await getServerSupabase().from('contacts')
    .update({ next_action: null, next_action_at: null, updated_at: new Date().toISOString() })
    .eq('id', contactId).eq('store_id', ctx.storeId).select(COMMERCIAL_COLUMNS).maybeSingle()
  if (error) return serverError('POST /api/data/commercial/close-followup', error, 'No se pudo cerrar el seguimiento')
  return NextResponse.json({ contact: data })
}
