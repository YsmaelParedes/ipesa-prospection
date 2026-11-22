/**
 * Archivos de las cotizaciones subidas (solo servidor). El navegador sube el
 * archivo con una dirección firmada; aquí se revisa que la ruta sea de la
 * tienda y que el contenido de verdad sea un PDF, JPG o PNG. Para verlo se da
 * una dirección que dura poco: las respuestas de Vercel no pasan de 4.5 MB.
 */
import { randomUUID } from 'node:crypto'
import { getServerSupabase, type StoreContext } from './supabase-server'
import { randomToken } from './crypto'
import { cleanFilename, contentMatches } from './whatsappFiles'
import { MAX_QUOTE_FILE, QUOTE_FILES_BUCKET, QUOTE_FILE_EXT, QUOTE_FILE_PATH, type QuoteFileMime } from './quoteFiles'
import { QUOTE_COLUMNS, storeToday, type QuoteRow } from './quotesServer'
import type { SendVia } from './quotes'

const bucket = () => getServerSupabase().storage.from(QUOTE_FILES_BUCKET)
const MIME_BY_EXT: Record<string, QuoteFileMime> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }

/** Dónde subir el archivo (la ruta la arma el servidor; la dirección dura 2 horas). */
export async function quoteUploadUrl(storeId: string, mime: QuoteFileMime): Promise<{ path: string; signedUrl: string }> {
  const path = `${storeId}/${randomUUID()}.${QUOTE_FILE_EXT[mime]}`
  const { data, error } = await bucket().createSignedUploadUrl(path)
  if (error || !data) throw error ?? new Error('Sin dirección de subida')
  return { path, signedUrl: data.signedUrl }
}

export type QuoteFile = { path: string; mime: QuoteFileMime; size: number }

/**
 * El archivo que el navegador dice haber subido: la ruta es de esta tienda,
 * existe y su contenido es del tipo de su extensión. Si no lo es, se borra.
 */
export async function verifyQuoteFile(storeId: string, path: unknown): Promise<{ ok: true; file: QuoteFile } | { ok: false; error: string }> {
  const m = typeof path === 'string' ? QUOTE_FILE_PATH.exec(path) : null
  if (!m || m[1] !== storeId) return { ok: false, error: 'Vuelve a elegir el archivo' }
  const filePath = path as string
  const missing = { ok: false as const, error: 'No encontramos el archivo. Vuelve a subirlo.' }
  const { data, error } = await bucket().createSignedUrl(filePath, 60)
  if (error || !data) return missing
  // Solo los primeros bytes: con eso se sabe el tipo y el tamaño total
  const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-15' } })
  if (!res.ok) return missing
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 16)
  const size = Number(res.headers.get('content-range')?.split('/')[1] ?? res.headers.get('content-length'))
  const mime = MIME_BY_EXT[m[2]]
  if (!(size > 0) || size > MAX_QUOTE_FILE || !contentMatches(mime, head)) {
    await bucket().remove([filePath]).catch(() => {})
    return { ok: false, error: size > MAX_QUOTE_FILE ? 'El archivo pesa más de 10 MB' : 'El archivo no es un PDF, JPG o PNG válido' }
  }
  return { ok: true, file: { path: filePath, mime, size } }
}

/** Dirección para verlo (o descargarlo con su nombre); dura 10 minutos. */
export async function quoteFileUrl(path: string, downloadName?: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, 600, downloadName ? { download: downloadName } : undefined)
  if (error || !data) throw error ?? new Error('Sin dirección firmada')
  return data.signedUrl
}

/** Lleva al archivo: ver en el navegador (inline) o descargar con su nombre. */
export async function quoteFileResponse(q: Pick<QuoteRow, 'file_path' | 'file_name'>, inline: boolean): Promise<Response> {
  const url = await quoteFileUrl(q.file_path as string, inline ? undefined : q.file_name ?? 'cotizacion')
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
  })
}

/** El archivo completo, para mandarlo por correo o por el chat. */
export async function readQuoteFile(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(path)
  if (error || !data) throw error ?? new Error('Archivo no encontrado')
  return new Uint8Array(await data.arrayBuffer())
}

/** Al borrar la cotización (si falla, solo queda el aviso en el registro). */
export async function removeQuoteFile(path: string | null) {
  if (!path) return
  const { error } = await bucket().remove([path])
  if (error) console.error('[quote-files] no se pudo borrar', path, error.message)
}

export type UploadedQuoteInput = {
  file: QuoteFile
  fileName: string
  client: { contact_id: string | null; client_name: string; client_phone: string; client_email: string }
  total: number
  validUntil: string
  /** Ya registrada en Comercial (desde «Cotización enviada»); si no, queda en borrador y la envía send_quote. */
  sent?: { via: SendVia | null; activityId: string }
}

/** Guarda la cotización subida: sin folio ni renglones, con el total que escribió el vendedor. */
export async function insertUploadedQuote(ctx: StoreContext, input: UploadedQuoteInput): Promise<QuoteRow> {
  const { data, error } = await getServerSupabase().from('quotes').insert([{
    store_id: ctx.storeId, folio: null, created_by: ctx.uid, ...input.client,
    items: [], discount_kind: 'amount', discount_value: 0, tax_rate: 0, notes: '',
    issued_on: storeToday(ctx), valid_until: input.validUntil,
    subtotal: input.total, discount: 0, tax: 0, total: input.total,
    share_token: randomToken(16),
    status: input.sent ? 'sent' : 'draft',
    sent_at: input.sent ? new Date().toISOString() : null,
    sent_via: input.sent?.via ?? null,
    activity_id: input.sent?.activityId ?? null,
    file_path: input.file.path, file_name: cleanFilename(input.fileName), file_mime: input.file.mime, file_size: input.file.size,
  }]).select(QUOTE_COLUMNS).single()
  if (error) throw error
  return data as unknown as QuoteRow
}
