import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { getVisibleContact } from '@/lib/commercialServer'
import { jsonError, parseFields, readJson, rpcUserError, serverError, type Schema } from '@/lib/validation'
import { MAX_TOTAL, activityKindFor, addDaysIso } from '@/lib/quotes'
import { clientFromContact, getQuoteSettings, quoteToClient, storeToday, type QuoteRow } from '@/lib/quotesServer'
import { insertUploadedQuote, verifyQuoteFile } from '@/lib/quoteFilesServer'

const UPLOAD_SCHEMA: Schema = {
  contact_id:  { type: 'uuid', nullable: true, label: 'Cliente' },
  client_name: { type: 'text', max: 200, label: 'Nombre del cliente' },
  total:       { type: 'number', min: 0, max: MAX_TOTAL, required: true, label: 'Total' },
  valid_until: { type: 'date', nullable: true, label: 'Válida hasta' },
  via:         { type: 'enum', values: ['whatsapp', 'correo', 'en_persona'], required: true, label: 'Cómo se la mandaste' },
  file_name:   { type: 'text', max: 300, required: true, label: 'Archivo' },
}

/**
 * POST /api/data/quotes/upload — { path, file_name, total, via, contact_id? | client_name?, valid_until? }
 * La cotización subida (ya en el almacenamiento) queda en la lista y cuenta
 * como enviada: si es de un contacto, registra «Cotización enviada» con su
 * total y el seguimiento a 2 días (send_quote).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, UPLOAD_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  const d = parsed.data as { contact_id?: string | null; client_name?: string; total: number; valid_until?: string | null; via: 'whatsapp' | 'correo' | 'en_persona'; file_name: string }
  if (!(d.total > 0)) return jsonError('Escribe el total de la cotización')

  try {
    const today = storeToday(ctx)
    let client = { contact_id: null as string | null, client_name: (d.client_name ?? '').trim(), client_phone: '', client_email: '' }
    if (d.contact_id) {
      if (!(await getVisibleContact(ctx, d.contact_id))) return jsonError('Cliente no encontrado', 404)
      client = (await clientFromContact(ctx.storeId, d.contact_id)) ?? client
    }
    if (!client.client_name) return jsonError('Escribe el nombre del cliente')

    const checked = await verifyQuoteFile(ctx.storeId, body.path)
    if (!checked.ok) return jsonError(checked.error)
    const validUntil = d.valid_until && d.valid_until >= today ? d.valid_until : addDaysIso(today, (await getQuoteSettings(ctx.storeId)).validDays)

    const quote = await insertUploadedQuote(ctx, { file: checked.file, fileName: d.file_name, client, total: d.total, validUntil })
    const { data, error } = await getServerSupabase().rpc('send_quote', {
      p_store: ctx.storeId, p_actor: ctx.uid, p_quote: quote.id, p_via: d.via, p_kind: activityKindFor(d.via), p_today: today,
    })
    if (error) {
      const known = rpcUserError(error)
      if (known) return jsonError(known.message, known.status)
      throw error
    }
    const names = await getUserNameMap(ctx.storeId).catch(() => new Map<string, string>())
    return NextResponse.json({ quote: quoteToClient(data as QuoteRow, names, today) })
  } catch (error) {
    return serverError('POST /api/data/quotes/upload', error, 'No se pudo guardar la cotización')
  }
}
