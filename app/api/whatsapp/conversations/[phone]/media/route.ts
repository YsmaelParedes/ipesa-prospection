import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { WHATSAPP_NOT_CONNECTED } from '@/lib/storeWhatsApp'
import { openOutbox } from '@/lib/whatsappOutbox'
import { normalizePhone } from '@/lib/phone'
import {
  MAX_CAPTION, MAX_SEND_BYTES, SEND_TYPES, cleanFilename, contentMatches, fmtSize, sendMimeOf,
} from '@/lib/whatsappFiles'
import { jsonError, serverError } from '@/lib/validation'

type Ctx = { params: Promise<{ phone: string }> }

async function phoneParam(params: Ctx['params']): Promise<string | null> {
  const raw = decodeURIComponent((await params).phone)
  if (!/^\+?\d{10,15}$/.test(raw)) return null
  const phone = normalizePhone(raw)
  return /^\d{10}$/.test(phone) ? phone : null
}

/**
 * POST /api/whatsapp/conversations/[phone]/media — multipart { file, caption? }
 * Envía una foto (JPG/PNG), un video (MP4) o un documento (PDF, Word, Excel,
 * PowerPoint, texto) de hasta 4 MB. Como el texto libre, solo dentro de las
 * 24 h desde el último mensaje del cliente. El archivo se sube a Meta, se
 * envía y queda en el historial con su id para mostrarlo en el chat.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx
  const phone = await phoneParam(params)
  if (!phone) return jsonError('Número inválido')

  let form: FormData
  try { form = await req.formData() } catch { return jsonError('Formulario inválido') }
  const file = form.get('file')
  const captionRaw = form.get('caption')
  if (!(file instanceof File)) return jsonError('Elige un archivo')
  if (file.size === 0) return jsonError('El archivo está vacío')
  if (file.size > MAX_SEND_BYTES) return jsonError(`El archivo pesa ${fmtSize(file.size)}; el máximo es ${fmtSize(MAX_SEND_BYTES)}`, 413)
  const caption = typeof captionRaw === 'string' ? captionRaw.trim() : ''
  if (caption.length > MAX_CAPTION) return jsonError(`El texto del archivo excede ${MAX_CAPTION} caracteres`)

  const mime = sendMimeOf(file.name, file.type)
  if (!mime) return jsonError('Ese tipo de archivo no se puede enviar. Usa foto (JPG o PNG), video MP4, PDF, Word, Excel, PowerPoint o texto.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!contentMatches(mime, bytes)) return jsonError('El archivo no corresponde a su tipo (¿está dañado o se le cambió la extensión?)')
  const kind = SEND_TYPES[mime]
  const filename = cleanFilename(file.name)

  const outbox = await openOutbox(ctx)
  if (!outbox) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const sent = await outbox.media(phone, { bytes, mime, kind, filename, caption })
  if (sent.status === 'rejected') return NextResponse.json({ error: sent.error, code: sent.code }, { status: 502 })
  // El archivo SÍ salió; solo falló guardarlo en el historial
  if (sent.status === 'unrecorded') return serverError('POST /api/whatsapp/conversations/[phone]/media', sent.cause, 'El archivo se envió pero no se pudo guardar en el historial')
  return NextResponse.json({ message: sent.message })
}
