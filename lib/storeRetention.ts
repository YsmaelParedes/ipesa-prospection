/**
 * Eliminación de tiendas inactivas (solo servidor). La corre el cron diario
 * (/api/cron/retention). Por cada tienda en Litro sin uso en 6 meses:
 *   1. Primer aviso al dueño por correo y se programa a 30 días.
 *   2. Último aviso 7 días antes (si sale tarde, la fecha se recorre para
 *      dejar siempre 7 días desde el aviso).
 *   3. Al llegar la fecha se elimina con todos sus datos, sus archivos y las
 *      cuentas que se quedan sin ninguna tienda.
 * Entrar a la tienda (touch_store_seen en /api/me) cancela todo. La base
 * vuelve a comprobar cada condición al eliminar (delete_inactive_store).
 * Sin correo configurado no hace nada: nadie se elimina sin aviso.
 */
import { APP_NAME } from './brand'
import { emailConfigured, escapeHtml, sendEmail } from './email'
import { RETENTION_IDLE_DAYS, RETENTION_IDLE_MONTHS, RETENTION_LAST_NOTICE_DAYS, RETENTION_NOTICE_DAYS } from './retention'
import { getServerSupabase } from './supabase-server'

const DAY = 86_400_000
const BUCKETS = ['store-assets', 'whatsapp-media']
/** Freno: si un día salen más, algo anda mal (fechas, datos); se detiene y se reporta. */
const MAX_DELETIONS_PER_RUN = 10

type StatusRow = {
  id: string; name: string; slug: string; last_used_at: string; idle: boolean; protected: boolean
  deletion_scheduled_for: string | null; deletion_notices: number; owner_emails: string[]
}

export type RetentionResult = {
  dryRun: boolean
  candidates: number
  cancelled: string[]
  firstNotice: string[]
  lastNotice: string[]
  deleted: string[]
  errors: string[]
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' })

function noticeEmail(st: StatusRow, deleteAt: number, last: boolean, origin: string) {
  const name = st.name
  const used = fmtDay(new Date(st.last_used_at).getTime())
  const date = fmtDay(deleteAt)
  const link = `${origin}/login`
  const subject = last
    ? `Última semana: ${name} se eliminará el ${date}`
    : `${name} se eliminará el ${date} por falta de uso`
  const lines = [
    `Nadie de tu equipo ha usado ${name} en ${APP_NAME} desde el ${used}.`,
    `Las tiendas del plan Litro que pasan ${RETENTION_IDLE_MONTHS} meses sin uso se eliminan con toda su información: contactos, actividades, equipo y configuración. No se puede recuperar.`,
    `Para conservarla, solo entra a tu tienda antes del ${date}. Con eso se cancela la eliminación.`,
    `Si ya no la vas a usar pero quieres tus datos, entra y descárgalos en Excel desde Configuración › Tienda.`,
  ]
  const text = [...lines, '', `Entrar: ${link}`, '', `¿Dudas? Responde a este correo.`].join('\n')
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:520px">
${lines.map(l => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join('\n')}
<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="background:#D7263D;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">Entrar a mi tienda</a></p>
<p style="margin:0;color:#6e6e73;font-size:13px">¿Dudas? Responde a este correo.</p>
</div>`
  return { subject, html, text }
}

export async function runRetention({ origin, dryRun = false, now = Date.now() }: { origin: string; dryRun?: boolean; now?: number }): Promise<RetentionResult> {
  const result: RetentionResult = { dryRun, candidates: 0, cancelled: [], firstNotice: [], lastNotice: [], deleted: [], errors: [] }
  if (!emailConfigured()) throw new Error('RESEND_API_KEY no configurada: no se avisa ni se elimina ninguna tienda')

  const db = getServerSupabase()
  const { data, error } = await db.rpc('store_retention_status', { p_idle_days: RETENTION_IDLE_DAYS })
  if (error) throw error
  const rows = (data ?? []) as StatusRow[]
  const idleCutoff = new Date(now - RETENTION_IDLE_DAYS * DAY).toISOString()

  for (const st of rows) {
    const label = `${st.name} (${st.slug})`
    try {
      // Ya no es candidata (alguien la usó, pagó o la excluiste): se cancela la cuenta regresiva
      if (!st.idle || st.protected) {
        if (st.deletion_scheduled_for || st.deletion_notices) {
          result.cancelled.push(label)
          if (!dryRun) {
            const { error: e } = await db.from('stores').update({ deletion_scheduled_for: null, deletion_notices: 0 }).eq('id', st.id)
            if (e) throw e
          }
        }
        continue
      }
      result.candidates++
      const scheduled = st.deletion_scheduled_for ? new Date(st.deletion_scheduled_for).getTime() : null

      if (st.deletion_notices === 0 || scheduled === null) {
        const deleteAt = now + RETENTION_NOTICE_DAYS * DAY
        result.firstNotice.push(label)
        if (dryRun) continue
        if (st.owner_emails.length) {
          await sendEmail({ to: st.owner_emails, ...noticeEmail(st, deleteAt, false, origin), idempotencyKey: `retention-1-${st.id}-${new Date(now).toISOString().slice(0, 10)}` })
        }
        // Solo si sigue sin uso (alguien pudo entrar mientras se enviaba el correo)
        const { error: e } = await db.from('stores')
          .update({ deletion_scheduled_for: new Date(deleteAt).toISOString(), deletion_notices: 1 })
          .eq('id', st.id).eq('deletion_notices', 0).or(`last_seen_at.is.null,last_seen_at.lt.${idleCutoff}`)
        if (e) throw e
      } else if (st.deletion_notices === 1 && now >= scheduled - RETENTION_LAST_NOTICE_DAYS * DAY) {
        const deleteAt = Math.max(scheduled, now + RETENTION_LAST_NOTICE_DAYS * DAY)
        result.lastNotice.push(label)
        if (dryRun) continue
        if (st.owner_emails.length) {
          await sendEmail({ to: st.owner_emails, ...noticeEmail(st, deleteAt, true, origin), idempotencyKey: `retention-2-${st.id}-${st.deletion_scheduled_for}` })
        }
        const { error: e } = await db.from('stores')
          .update({ deletion_scheduled_for: new Date(deleteAt).toISOString(), deletion_notices: 2 })
          .eq('id', st.id).eq('deletion_notices', 1)
        if (e) throw e
      } else if (st.deletion_notices === 2 && now >= scheduled) {
        if (result.deleted.length >= MAX_DELETIONS_PER_RUN) {
          result.errors.push(`Se alcanzó el límite de ${MAX_DELETIONS_PER_RUN} eliminaciones por día; ${label} queda para mañana`)
          continue
        }
        result.deleted.push(label)
        if (dryRun) continue
        await deleteStore(st.id)
      }
    } catch (e) {
      result.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return result
}

/** Elimina la tienda (la base decide si procede), luego sus archivos y las cuentas huérfanas. */
async function deleteStore(storeId: string) {
  const db = getServerSupabase()
  const { data, error } = await db.rpc('delete_inactive_store', { p_store: storeId, p_idle_days: RETENTION_IDLE_DAYS })
  if (error) throw error
  if (!data?.deleted) throw new Error(`La base no la eliminó (${data?.reason ?? 'sin motivo'})`)

  const problems: string[] = []
  for (const bucket of BUCKETS) {
    const { data: files, error: listError } = await db.storage.from(bucket).list(storeId, { limit: 1000 })
    if (listError) { problems.push(`${bucket}: ${listError.message}`); continue }
    const paths = (files ?? []).map(f => `${storeId}/${f.name}`)
    if (paths.length) {
      const { error: removeError } = await db.storage.from(bucket).remove(paths)
      if (removeError) problems.push(`${bucket}: ${removeError.message}`)
    }
  }
  for (const userId of (data.orphans ?? []) as string[]) {
    const { error: userError } = await db.auth.admin.deleteUser(userId)
    if (userError) problems.push(`cuenta ${userId}: ${userError.message}`)
  }
  if (problems.length) throw new Error(`Tienda eliminada, pero quedó pendiente: ${problems.join('; ')}`)
}
