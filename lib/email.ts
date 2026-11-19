/**
 * Correos automáticos de la app (solo servidor) por la API de Resend. Salen
 * de no-responder@mail.matices.app y las respuestas llegan a soporte.
 *   RESEND_API_KEY  clave de solo envío limitada a mail.matices.app
 * Sin la clave no se envía nada: emailConfigured() es false y quien llama
 * decide qué hacer (la eliminación de tiendas inactivas se detiene).
 */
import { APP_NAME } from './brand'
import { EMAILS } from './legal'

const FROM = `${APP_NAME} <no-responder@mail.matices.app>`

export const emailConfigured = () => !!process.env.RESEND_API_KEY

export type EmailAttachment = { filename: string; content: Buffer }
export type Email = {
  to: string[]; subject: string; html: string; text: string; idempotencyKey?: string
  /** Remitente con otro nombre y buzón de mail.matices.app (p. ej. cotizaciones de una tienda). */
  from?: { name: string; local: string }
  /** A quién le llegan las respuestas (por defecto, soporte). */
  replyTo?: string
  attachments?: EmailAttachment[]
}

/** Nombre seguro para el encabezado From (sin comillas, <> ni saltos de línea). */
const headerName = (s: string) => s.replace(/[\\"<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || APP_NAME

export async function sendEmail({ to, subject, html, text, idempotencyKey, from, replyTo, attachments }: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY no está configurada en el entorno')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Resend descarta un segundo envío con la misma clave (reintentos del cron)
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: from ? `"${headerName(from.name)}" <${from.local}@mail.matices.app>` : FROM,
      to, reply_to: replyTo ?? EMAILS.soporte, subject, html, text,
      ...(attachments?.length ? { attachments: attachments.map(a => ({ filename: a.filename, content: a.content.toString('base64') })) } : {}),
    }),
    signal: AbortSignal.timeout(attachments?.length ? 30_000 : 15_000),
  })
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
