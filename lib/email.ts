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

export type Email = { to: string[]; subject: string; html: string; text: string; idempotencyKey?: string }

export async function sendEmail({ to, subject, html, text, idempotencyKey }: Email): Promise<void> {
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
    body: JSON.stringify({ from: FROM, to, reply_to: EMAILS.soporte, subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
