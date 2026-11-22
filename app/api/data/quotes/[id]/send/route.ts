import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, rpcUserError, serverError } from '@/lib/validation'
import { DAY, limitShared, tooMany } from '@/lib/rateLimit'
import { emailConfigured, escapeHtml, sendEmail } from '@/lib/email'
import { openOutbox } from '@/lib/whatsappOutbox'
import { WHATSAPP_NOT_CONNECTED } from '@/lib/storeWhatsApp'
import { waChatPhone } from '@/lib/phone'
import { MAX_CAPTION } from '@/lib/whatsappFiles'
import { effectivePlan } from '@/lib/stores'
import { APP_NAME } from '@/lib/brand'
import {
  SEND_VIAS, activityKindFor, clientQuoteName, fmtLongDate, fmtMoney, isFilled, pdfFilename, quotePublicPath, type SendVia,
} from '@/lib/quotes'
import { isImageFile } from '@/lib/quoteFiles'
import { readQuoteFile } from '@/lib/quoteFilesServer'
import {
  getQuote, getQuoteSettings, quoteStoreOf, quoteToClient, renderQuotePdf, sellerNameOf, storeToday, type QuoteRow,
} from '@/lib/quotesServer'

type Ctx = { params: Promise<{ id: string }> }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Correos de cotizaciones por tienda al día: Litro poco (registro gratis), los planes de pago más. */
const EMAILS_PER_DAY = { litro: 20, paid: 200 }

/** WhatsApp manda como foto una imagen de hasta 5 MB; más grande, como documento. */
const WA_IMAGE_MAX = 5 * 1024 * 1024

/** Lo que se adjunta: el PDF de Matices o el archivo que se subió. */
async function attachmentOf(q: QuoteRow, renderPdf: () => Promise<Buffer>, storeName: string) {
  if (q.file_path) {
    return { bytes: await readQuoteFile(q.file_path), mime: q.file_mime ?? 'application/pdf', filename: q.file_name ?? 'Cotizacion.pdf' }
  }
  return { bytes: new Uint8Array(await renderPdf()), mime: 'application/pdf', filename: pdfFilename(q.folio ?? 0, storeName) }
}

function emailHtml(message: string, q: QuoteRow, storeName: string, url: string): string {
  const paragraphs = message.trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#2d2d2c">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:28px">
<div style="font-size:15px;line-height:1.55">${paragraphs}</div>
<div style="border:1px solid #e4e4e7;border-radius:6px;padding:14px 16px;margin:18px 0">
<div style="font-size:13px;color:#6b6b6a">${clientQuoteName(q.folio)} · ${escapeHtml(storeName)}</div>
<div style="font-size:22px;font-weight:bold;color:#131313;margin:4px 0">${fmtMoney(q.total)}</div>
<div style="font-size:13px;color:#6b6b6a">Válida hasta el ${fmtLongDate(q.valid_until)}</div>
</div>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#131313;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 18px;border-radius:6px">Ver cotización</a>
<p style="font-size:12px;color:#8f8f8e;margin:18px 0 0">${q.file_mime && q.file_mime !== 'application/pdf' ? 'La cotización va adjunta a este correo.' : 'El PDF va adjunto a este correo.'}</p>
</div>
<p style="font-size:11px;color:#8f8f8e;text-align:center;margin:14px 0 0">Enviado por ${escapeHtml(storeName)} con ${APP_NAME}</p>
</div></body></html>`
}

/**
 * POST /api/data/quotes/[id]/send — { via, message?, email?, subject? }
 *  · correo: Matices lo manda con el PDF adjunto; las respuestas le llegan al vendedor.
 *  · chat: el PDF por el WhatsApp de la tienda (Cubeta), dentro de las 24 h.
 *  · whatsapp, compartir, enlace, en_persona: el vendedor lo manda por su cuenta.
 * Después la marca como enviada y la registra en el sistema comercial (send_quote).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const { id } = await params
  if (!isUUID(id)) return jsonError('Cotización no encontrada', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const via = body.via as SendVia
  if (!(SEND_VIAS as readonly string[]).includes(via)) return jsonError('Elige cómo enviarla')
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  try {
    const q = await getQuote(ctx, id)
    if (!q) return jsonError('Cotización no encontrada', 404)
    if (q.status !== 'draft' && q.status !== 'sent') return jsonError('Reabre la cotización para volver a enviarla', 409)
    if (!q.client_name.trim()) return jsonError('Escribe el nombre del cliente')
    if (!q.file_path && !q.items.some(isFilled)) return jsonError('Agrega al menos un producto')

    const origin = req.nextUrl.origin
    const url = `${origin}${quotePublicPath(q.share_token)}`

    if (via === 'correo' || via === 'chat') {
      const settings = await getQuoteSettings(ctx.storeId)
      const header = quoteStoreOf(ctx.store, settings)
      const seller = await sellerNameOf(ctx.storeId, q.created_by)
      const renderPdf = () => renderQuotePdf(q, header, seller, origin)

      if (via === 'correo') {
        const to = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (!EMAIL_RE.test(to) || to.length > 254) return jsonError('Escribe un correo válido')
        if (message.length > 4000) return jsonError('El mensaje excede 4,000 caracteres')
        const subject = (typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : `${clientQuoteName(q.folio)} de ${ctx.store.name}`).slice(0, 200)
        if (!emailConfigured()) return jsonError('El envío de correos no está disponible en este momento', 503)
        const perDay = effectivePlan(ctx.store) === 'litro' ? EMAILS_PER_DAY.litro : EMAILS_PER_DAY.paid
        if (!(await limitShared([{ key: `quote-email:${ctx.storeId}`, max: perDay, windowMs: DAY }]))) {
          return tooMany(`Tu tienda llegó al máximo de ${perDay} correos de cotizaciones por día. Mándala por WhatsApp o descarga el PDF.`, 3600)
        }
        const file = await attachmentOf(q, renderPdf, ctx.store.name)
        const text = `${message}\n\n${clientQuoteName(q.folio)} · ${fmtMoney(q.total)} · válida hasta el ${fmtLongDate(q.valid_until)}\nVer en línea: ${url}`
        await sendEmail({
          to: [to], subject, text, html: emailHtml(message, q, ctx.store.name, url),
          from: { name: ctx.store.name, local: 'cotizaciones' },
          replyTo: ctx.user.email ?? undefined,
          attachments: [{ filename: file.filename, content: Buffer.from(file.bytes) }],
        })
      } else {
        if (!ctx.modules.whatsapp) return jsonError('WhatsApp no está activo en tu tienda', 403)
        const phone = waChatPhone(q.client_phone)
        if (!phone) return jsonError('El cliente no tiene un teléfono válido para WhatsApp')
        if (message.length > MAX_CAPTION) return jsonError(`El mensaje excede ${MAX_CAPTION} caracteres`)
        const outbox = await openOutbox(ctx)
        if (!outbox) return jsonError(WHATSAPP_NOT_CONNECTED, 409)
        const file = await attachmentOf(q, renderPdf, ctx.store.name)
        const asImage = isImageFile(file.mime) && file.bytes.length <= WA_IMAGE_MAX
        const sent = await outbox.media(phone, {
          bytes: file.bytes, mime: file.mime, kind: asImage ? 'image' : 'document',
          filename: file.filename, caption: message,
        })
        if (sent.status === 'rejected') return NextResponse.json({ error: sent.error || 'WhatsApp no aceptó el envío', code: sent.code }, { status: 502 })
        if (sent.status === 'unrecorded') console.error('[quotes/send] el PDF salió pero no quedó en el historial del chat', sent.cause)
      }
    }

    const { data, error } = await getServerSupabase().rpc('send_quote', {
      p_store: ctx.storeId, p_actor: ctx.uid, p_quote: q.id, p_via: via, p_kind: activityKindFor(via), p_today: storeToday(ctx),
    })
    if (error) {
      const known = rpcUserError(error)
      if (known) return jsonError(known.message, known.status)
      throw error
    }
    const names = await getUserNameMap(ctx.storeId).catch(() => new Map<string, string>())
    return NextResponse.json({ quote: quoteToClient(data as QuoteRow, names, storeToday(ctx)), url })
  } catch (error) {
    return serverError('POST /api/data/quotes/[id]/send', error, 'No se pudo enviar la cotización')
  }
}
