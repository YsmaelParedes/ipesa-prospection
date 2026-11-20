/**
 * Correos del fin de la prueba de Cubeta (solo servidor). Los manda el cron
 * diario (/api/cron/retention) al administrador principal de cada tienda:
 *   1. «Tu prueba de Cubeta termina en N días», cuando faltan 3 días o menos.
 *   2. «Terminó tu prueba de Cubeta», el primer día después de terminar.
 * No se manda si la tienda ya paga, está suspendida o cancelada, o la prueba
 * terminó hace más de 3 días (stores.trial_notices recuerda cuál salió).
 * Salen de no-responder@ y las respuestas llegan a hola@.
 */
import { APP_NAME } from './brand'
import { emailConfigured, escapeHtml, sendEmail } from './email'
import { EMAILS } from './legal'
import { fmtMoney, type PriceTable } from './billing'
import { PAID_PLAN, PAID_SUBSCRIPTION_STATUSES, PLANS, effectivePlan, mainAdminOf } from './stores'
import { getPriceTable, stripeConfigured } from './stripe'
import { getServerSupabase, getStoreMembers } from './supabase-server'

const DAY = 86_400_000
/** Cuántos días antes sale el primer aviso. */
export const TRIAL_NOTICE_DAYS = 3
/** Después de esto ya no se manda «Terminó tu prueba» (una tienda vieja no recibe un aviso tardío). */
const ENDED_WINDOW_DAYS = 3

type TrialRow = {
  id: string; name: string; status: string; created_by: string | null; plan: string; paid_until: string | null
  trial_ends_at: string; trial_notices: number; subscription_status: string | null
}

export type TrialNoticeKind = 'soon' | 'ended'

export type TrialNoticesResult = { dryRun: boolean; soon: string[]; ended: string[]; errors: string[] }

/** Qué aviso le toca hoy a una tienda (null = ninguno). Pura, para probarla sin red. */
export function trialNoticeFor(row: Omit<TrialRow, 'id' | 'name' | 'created_by'>, now: number): TrialNoticeKind | null {
  if (row.status === 'suspended' || row.status === 'cancelled') return null
  if ((PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(row.subscription_status ?? '')) return null
  const ends = Date.parse(row.trial_ends_at)
  if (!Number.isFinite(ends)) return null
  if (ends > now) {
    // Sigue en la prueba (no la cambiaron a mano por otra cosa)
    return row.plan === PAID_PLAN && row.trial_notices < 1 && ends - now <= TRIAL_NOTICE_DAYS * DAY ? 'soon' : null
  }
  // Ya está en Litro (si le dieron una cortesía, no se le avisa)
  return effectivePlan(row, now) === 'litro' && row.trial_notices < 2 && now - ends <= ENDED_WINDOW_DAYS * DAY ? 'ended' : null
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' })

type NoticeFacts = {
  store: string; adminName: string; ends: number; now: number; waiting: string[]; whatsapp: boolean; link: string
  /** Precios de Cubeta en Stripe (si se pudieron leer) */
  prices?: PriceTable | null
}

/** Asunto, HTML y texto del aviso (pura). */
export function trialNoticeEmail(kind: TrialNoticeKind, f: NoticeFacts) {
  const days = Math.max(1, Math.ceil((f.ends - f.now) / DAY))
  const subject = kind === 'ended'
    ? 'Terminó tu prueba de Cubeta'
    : days === 1 ? 'Tu prueba de Cubeta termina mañana' : `Tu prueba de Cubeta termina en ${days} días`
  const firstName = f.adminName.trim().split(/\s+/)[0]
  const people = f.waiting.map(n => n.trim().split(/\s+/)[0])
  const peopleText = people.length <= 1 ? people.join('') : `${people.slice(0, -1).join(', ')} y ${people[people.length - 1]}`
  const effects = kind === 'ended'
    ? [
        ...(f.whatsapp ? ['El WhatsApp de tu tienda ya no se ve en el CRM. Los mensajes se siguen guardando.'] : []),
        ...(people.length ? [`${peopleText} ya no ${people.length === 1 ? 'puede' : 'pueden'} entrar.`] : []),
        'Actividad diaria, metas y Acumulado quedaron con candado.',
      ]
    : [
        ...(f.whatsapp ? ['El WhatsApp de tu tienda deja de verse en el CRM. Los mensajes se siguen guardando.'] : []),
        ...(people.length ? [`${peopleText} ya no ${people.length === 1 ? 'podrá' : 'podrán'} entrar.`] : []),
        'Actividad diaria, metas y Acumulado quedan con candado.',
      ]
  const lines = kind === 'ended'
    ? [`La prueba de Cubeta de ${f.store} terminó el ${fmtDay(f.ends)}. Tu tienda pasó a Litro, gratis, sin borrar nada.`, 'Desde ahora:']
    : [`La prueba de Cubeta de ${f.store} termina el ${fmtDay(f.ends)}. Ese día tu tienda pasa a Litro, gratis, sin borrar nada.`, 'Al pasar a Litro:']
  const cta = kind === 'ended' ? 'Para volver a tenerlo todo, activa Cubeta' : 'Para seguir como hasta hoy, activa Cubeta'
  const monthly = f.prices?.monthly[PAID_PLAN]
  const annual = f.prices?.annual[PAID_PLAN]
  const price = monthly
    ? `${cta}: ${fmtMoney(monthly.amount, monthly.currency)} al mes${annual ? `, o ${fmtMoney(annual.amount, annual.currency)} al año con 2 meses gratis` : ''}.`
    : `${cta}: ${PLANS.cubeta.label} se paga cada mes o cada año, con 2 meses gratis.`
  const greeting = firstName ? `Hola, ${firstName}:` : 'Hola:'

  const text = [greeting, '', ...lines, ...effects.map(e => `- ${e}`), '', price, '', `Activar Cubeta: ${f.link}`, '', 'Si tienes dudas, responde este correo y te ayudamos.'].join('\n')
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#2d2d2c">
<div style="max-width:560px;margin:0 auto;padding:28px 16px">
<div style="background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:28px;font-size:15px;line-height:1.55">
<p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 14px">${escapeHtml(lines[0])}</p>
<p style="margin:0 0 8px">${escapeHtml(lines[1])}</p>
<ul style="margin:0 0 14px;padding-left:20px">${effects.map(e => `<li style="margin-bottom:6px">${escapeHtml(e)}</li>`).join('')}</ul>
<p style="margin:0 0 18px">${escapeHtml(price)}</p>
<a href="${escapeHtml(f.link)}" style="display:inline-block;background:#131313;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 18px;border-radius:6px">Activar Cubeta</a>
<p style="margin:20px 0 0;font-size:13px;color:#6b6b6a">Si tienes dudas, responde este correo y te ayudamos.</p>
</div>
<p style="font-size:11px;color:#8f8f8e;text-align:center;margin:14px 0 0">Te escribimos porque eres el administrador de ${escapeHtml(f.store)} en ${APP_NAME}.</p>
</div></body></html>`
  return { subject, html, text }
}

export async function runTrialNotices({ origin, dryRun = false, now = Date.now() }: { origin: string; dryRun?: boolean; now?: number }): Promise<TrialNoticesResult> {
  const result: TrialNoticesResult = { dryRun, soon: [], ended: [], errors: [] }
  if (!emailConfigured()) return result

  const db = getServerSupabase()
  const { data, error } = await db.from('stores')
    .select('id, name, status, created_by, plan, paid_until, trial_ends_at, trial_notices, subscription_status')
    .not('trial_ends_at', 'is', null)
    .lt('trial_notices', 2)
    .gt('trial_ends_at', new Date(now - ENDED_WINDOW_DAYS * DAY).toISOString())
    .lt('trial_ends_at', new Date(now + (TRIAL_NOTICE_DAYS + 1) * DAY).toISOString())
  if (error) throw error

  let prices: PriceTable | null | undefined
  for (const row of (data ?? []) as TrialRow[]) {
    const kind = trialNoticeFor(row, now)
    if (!kind) continue
    const label = row.name
    try {
      const members = (await getStoreMembers(row.id)).filter(m => m.status === 'active')
      const mainId = mainAdminOf(row.created_by, members.filter(m => m.role === 'admin').sort((a, b) => a.joined_at.localeCompare(b.joined_at)).map(m => m.user_id))
      const admin = members.find(m => m.user_id === mainId)
      if (!admin?.email) continue
      ;(kind === 'soon' ? result.soon : result.ended).push(label)
      if (dryRun) continue
      if (prices === undefined) prices = stripeConfigured() ? await getPriceTable().catch(() => null) : null
      const { data: wa } = await db.from('store_whatsapp').select('store_id')
        .eq('store_id', row.id).eq('connection_method', 'embedded').not('access_token_enc', 'is', null).maybeSingle()
      const email = trialNoticeEmail(kind, {
        store: row.name, adminName: admin.display_name || '', ends: Date.parse(row.trial_ends_at), now,
        waiting: members.filter(m => m.user_id !== mainId).map(m => m.display_name || m.email),
        whatsapp: !!wa, link: `${origin}/configuracion?tab=plan`, prices,
      })
      await sendEmail({
        to: [admin.email], ...email, replyTo: EMAILS.hola,
        idempotencyKey: `trial-${kind}-${row.id}-${row.trial_ends_at.slice(0, 10)}`,
      })
      const { error: e } = await db.from('stores').update({ trial_notices: kind === 'soon' ? 1 : 2 })
        .eq('id', row.id).eq('trial_notices', row.trial_notices)
      if (e) throw e
    } catch (e) {
      result.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return result
}
