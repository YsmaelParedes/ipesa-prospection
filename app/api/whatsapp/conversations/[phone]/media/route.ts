import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { sendWhatsAppMedia, uploadWhatsAppMedia } from '@/lib/whatsapp'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { contactForPhone } from '@/lib/whatsappInbox'
import { normalizePhone, toWhatsAppNumber } from '@/lib/phone'
import { isWindowOpen } from '@/lib/whatsappSafety'
import {
  MAX_CAPTION, MAX_SEND_BYTES, SEND_LABELS, SEND_TYPES, cleanFilename, contentMatches, fmtSize, sendMimeOf,
} from '@/lib/whatsappFiles'
import { jsonError, serverError } from '@/lib/validation'

type Ctx = { params: Promise<{ phone: string }> }

const MESSAGE_FIELDS = 'id, phone, direction, body, status, error_message, template_name, media_id, media_type, media_mime, profile_name, contact_id, user_id, created_at'

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

  // Ventana de 24 h: se revisa antes de subir nada a Meta
  const supabase = getServerSupabase()
  const { data: lastInbound } = await supabase.from('whatsapp_messages').select('created_at')
    .eq('store_id', ctx.storeId).eq('phone', phone).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!isWindowOpen(lastInbound?.created_at)) {
    return jsonError('Pasaron más de 24 h desde el último mensaje del cliente: solo se puede enviar una plantilla aprobada.', 409)
  }

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const upload = await uploadWhatsAppMedia(creds, new Blob([bytes], { type: mime }), filename)
  if (!upload.ok) return NextResponse.json({ error: upload.error, code: upload.code }, { status: 502 })
  const sent = await sendWhatsAppMedia(creds, toWhatsAppNumber(phone), kind, upload.id, { caption: caption || undefined, filename })
  if (!sent.ok) return NextResponse.json({ error: sent.error, code: sent.code }, { status: 502 })

  try {
    const contact = await contactForPhone(ctx.storeId, phone)
    // Igual que los que llegan: "📄 Documento · cotización.pdf" / "📷 Imagen · pie de foto"
    const shown = caption || (kind === 'document' ? filename : '')
    const { data, error } = await supabase.from('whatsapp_messages').insert([{
      store_id: ctx.storeId,
      contact_id: contact?.id ?? null,
      phone,
      direction: 'outbound',
      body: shown ? `${SEND_LABELS[kind]} · ${shown}` : SEND_LABELS[kind],
      media_id: upload.id,
      media_type: kind,
      media_mime: mime,
      wa_message_id: sent.messageId,
      status: 'sent',
      user_id: ctx.uid,
    }]).select(MESSAGE_FIELDS)
    if (error) throw error
    return NextResponse.json({ message: data?.[0] })
  } catch (error) {
    // El archivo SÍ salió; solo falló guardarlo en el historial
    return serverError('POST /api/whatsapp/conversations/[phone]/media', error, 'El archivo se envió pero no se pudo guardar en el historial')
  }
}
