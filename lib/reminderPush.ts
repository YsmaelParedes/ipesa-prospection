import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getServerSupabase } from './supabase-server'
import { sendPushToSubscriptions, type PushPayload, type PushSub } from './push'
import { remTypeInfo } from './crm'
import { DEFAULT_TZ, naiveIso, zonedIso } from './datetime'

/**
 * Avisos push de la Agenda:
 *  · A la hora de cada recordatorio: Supabase (pg_cron) revisa cada minuto si
 *    ya toca alguno y solo entonces llama a /api/cron/reminders.
 *  · Resumen de la mañana: el cron diario de Vercel llama a /api/cron/agenda.
 * reminder_date no lleva zona: es la hora LOCAL de la tienda tal cual se
 * eligió, así que "ahora" se expresa igual (zonedIso) y se compara como texto.
 * Recorren todas las tiendas a propósito: cada recordatorio es personal y solo
 * va a los dispositivos de su dueño.
 */

/* ── Quién puede llamar a los crons ─────────────────────────────────────── */

const ONE_TIME_TTL_MS = 5 * 60_000

/**
 * El cron de Vercel manda CRON_SECRET. Supabase manda un pase de un solo uso
 * que guarda en cron_tokens justo antes de llamar: se borra al usarlo y caduca
 * en 5 minutos, así que no hay un secreto que copiar de un lado al otro.
 * Sin CRON_SECRET ni pase válido no entra nadie (falla cerrado).
 */
export async function authorizeCron(req: NextRequest, { allowOneTime = false } = {}): Promise<boolean> {
  const header = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret) {
    const expected = `Bearer ${secret}`
    if (header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))) return true
  }
  if (!allowOneTime) return false
  const token = /^Bearer ([0-9a-f]{64})$/.exec(header)?.[1]
  if (!token) return false
  const { data, error } = await getServerSupabase()
    .from('cron_tokens')
    .delete()
    .eq('token', token)
    .gte('created_at', new Date(Date.now() - ONE_TIME_TTL_MS).toISOString())
    .select('token')
  return !error && !!data?.length
}

/* ── Destinatarios ──────────────────────────────────────────────────────── */

type Row = {
  id: string; store_id: string; user_id: string
  lead_name: string | null; nota: string | null; reminder_date: string; type: string | null
  push_sent?: boolean
}

const uniq = <T>(list: T[]) => [...new Set(list)]

/** Zona de cada tienda, quién sigue en su equipo y los dispositivos de cada persona. */
async function loadAudience(rows: Row[], now: Date) {
  const storeIds = uniq(rows.map(r => r.store_id))
  const userIds  = uniq(rows.map(r => r.user_id))
  const supabase = getServerSupabase()
  const [stores, members, subs] = await Promise.all([
    supabase.from('stores').select('id, status, timezone').in('id', storeIds),
    supabase.from('store_members').select('store_id, user_id').in('store_id', storeIds).in('user_id', userIds).eq('status', 'active'),
    supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ])
  const error = stores.error ?? members.error ?? subs.error
  if (error) throw error

  const zone = new Map<string, string>()
  const live = new Set<string>()
  for (const s of stores.data ?? []) {
    zone.set(s.id, s.timezone || DEFAULT_TZ)
    if (s.status === 'trial' || s.status === 'active') live.add(s.id)
  }
  // El aviso lleva nombres y notas de clientes de la tienda: solo para quien
  // sigue en su equipo y mientras la tienda esté vigente.
  const allowed = new Set((members.data ?? []).filter(m => live.has(m.store_id)).map(m => `${m.store_id}:${m.user_id}`))

  const devices = new Map<string, PushSub[]>()
  for (const { user_id, ...sub } of subs.data ?? []) devices.set(user_id, [...(devices.get(user_id) ?? []), sub])

  const nowByZone = new Map<string, string>()
  return {
    devices,
    canNotify: (r: Row) => allowed.has(`${r.store_id}:${r.user_id}`),
    /** "Ahora" en la hora local de la tienda del recordatorio. */
    nowFor(r: Row) {
      const tz = zone.get(r.store_id) ?? DEFAULT_TZ
      let iso = nowByZone.get(tz)
      if (!iso) { iso = zonedIso(now, tz); nowByZone.set(tz, iso) }
      return iso
    },
  }
}

async function markSent(ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) {
    await getServerSupabase().from('reminders').update({ push_sent: true }).in('id', ids.slice(i, i + 200)).eq('push_sent', false)
  }
}

/* ── Textos ─────────────────────────────────────────────────────────────── */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const hhmm = (iso: string) => naiveIso(iso).slice(11, 16).replace(/^0/, '')
const msBetween = (fromIso: string, toIso: string) => Date.parse(`${toIso}Z`) - Date.parse(`${fromIso}Z`)

const VERB: Record<string, (name: string) => string> = {
  call:     n => `Llamar a ${n}`,
  whatsapp: n => `Escribir a ${n}`,
  email:    n => `Correo para ${n}`,
  meeting:  n => `Reunión con ${n}`,
  task:     n => `Seguimiento a ${n}`,
}

/** "Llamar a Juan Pérez" cuando el recordatorio es sobre un cliente. */
function actionFor(r: Row): string | null {
  const name = r.lead_name?.trim()
  if (!name || name === r.nota?.trim()) return null
  return (VERB[r.type ?? ''] ?? VERB.task)(name)
}

function reminderPayload(r: Row, lateMs: number): PushPayload {
  const action = actionFor(r)
  const nota = r.nota?.trim() || ''
  let body = nota || 'Es la hora que programaste.'
  // Si sale con retraso (reintento), que se vea la hora original
  if (lateMs >= 15 * 60_000) body += ` · Era a las ${hhmm(r.reminder_date)}`
  return {
    title: clip(action ? `${remTypeInfo(r.type).emoji} ${action}` : '⏰ Recordatorio', 70),
    body:  clip(body, 180),
    url:   '/recordatorios',
    tag:   `rem-${r.id}`,
    sticky: true,
  }
}

type Day = { today: Row[]; overdue: number; recent: number }

function agendaPayload({ today, overdue }: Day): PushPayload {
  const s = (n: number) => (n === 1 ? '' : 's')
  const lines = today.slice(0, 3).map(r => `${hhmm(r.reminder_date)} ${clip(actionFor(r) ?? (r.nota?.trim() || 'Recordatorio'), 46)}`)
  const extra = [
    today.length > 3 ? `y ${today.length - 3} más` : '',
    overdue ? `${overdue} vencido${s(overdue)}` : '',
  ].filter(Boolean)
  if (extra.length) lines.push(extra.join(' · '))
  return today.length
    ? { title: `📋 Hoy tienes ${today.length} pendiente${s(today.length)}`, body: lines.join('\n'), url: '/recordatorios', tag: 'agenda-hoy' }
    : { title: `⚠️ Tienes ${overdue} pendiente${s(overdue)} vencido${s(overdue)}`, body: 'Ábrelos en la Agenda para ponerte al día.', url: '/recordatorios', tag: 'agenda-hoy' }
}

/* ── A la hora ──────────────────────────────────────────────────────────── */

/** Más atrasado que esto ya no se avisa uno por uno: va en el resumen de la mañana. */
const LATE_LIMIT_MS = 6 * 3600_000
/** Si ningún dispositivo lo recibió, se reintenta en las siguientes vueltas durante este tiempo. */
const RETRY_FOR_MS = 10 * 60_000

/** Un aviso por cada recordatorio cuya hora ya llegó (y que aún no se avisó). */
export async function sendDueReminders(now = new Date()) {
  const supabase = getServerSupabase()
  // Cota amplia (la zona más adelantada es UTC+14); luego cada tienda con su hora
  const bound = new Date(now.getTime() + 14 * 3600_000).toISOString().slice(0, 19)
  const { data, error } = await supabase
    .from('reminders')
    .select('id, store_id, user_id, lead_name, nota, reminder_date, type')
    .eq('completado', false)
    .eq('push_sent', false)
    .not('user_id', 'is', null)
    .lte('reminder_date', bound)
    .order('reminder_date', { ascending: true })
    .limit(200)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  const empty = { due: 0, sent: 0, failed: 0, expired: 0, retry: 0 }
  if (!rows.length) return empty

  const aud = await loadAudience(rows, now)
  const due = rows
    .map(r => ({ r, lateMs: msBetween(naiveIso(r.reminder_date), aud.nowFor(r)) }))
    .filter(d => d.lateMs >= 0)
  if (!due.length) return empty

  // Se apartan antes de enviar: si dos vueltas se cruzan, cada aviso sale una sola vez.
  const { data: claimed, error: claimError } = await supabase
    .from('reminders')
    .update({ push_sent: true })
    .in('id', due.map(d => d.r.id))
    .eq('push_sent', false)
    .select('id')
  if (claimError) throw claimError
  const mine = new Set((claimed ?? []).map(c => c.id as string))

  let sent = 0, failed = 0, expired = 0
  const retry: string[] = []
  for (const { r, lateMs } of due) {
    // Sin dueño vigente, sin dispositivos o muy atrasado: queda marcado sin aviso
    if (!mine.has(r.id) || lateMs > LATE_LIMIT_MS || !aud.canNotify(r)) continue
    const devices = aud.devices.get(r.user_id)
    if (!devices?.length) continue

    const result = await sendPushToSubscriptions(devices, reminderPayload(r, lateMs))
    sent += result.sent
    failed += result.failed
    expired += result.expired.length
    if (result.expired.length) aud.devices.set(r.user_id, devices.filter(d => !result.expired.includes(d.endpoint)))
    if (result.sent === 0 && result.failed > 0 && lateMs < RETRY_FOR_MS) retry.push(r.id)
  }
  if (retry.length) await supabase.from('reminders').update({ push_sent: false }).in('id', retry)
  return { due: due.length, sent, failed, expired, retry: retry.length }
}

/* ── Resumen de la mañana ───────────────────────────────────────────────── */

/** Un solo aviso por persona con lo que tiene hoy y cuántos pendientes se le vencieron. */
export async function sendMorningAgenda(now = new Date()) {
  const supabase = getServerSupabase()
  // Hasta el fin del día en la zona más adelantada (UTC+14 → 38 h desde ahora)
  const bound = new Date(now.getTime() + 38 * 3600_000).toISOString().slice(0, 19)
  const { data, error } = await supabase
    .from('reminders')
    .select('id, store_id, user_id, lead_name, nota, reminder_date, type, push_sent')
    .eq('completado', false)
    .not('user_id', 'is', null)
    .lte('reminder_date', bound)
    .order('reminder_date', { ascending: true })
    .limit(5000)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  if (!rows.length) return { users: 0, sent: 0, missed: 0 }

  const aud = await loadAudience(rows, now)
  const days = new Map<string, Day>()
  // Vencidos que nunca se avisaron uno por uno: el resumen cuenta como su aviso
  const missed: string[] = []
  for (const r of rows) {
    const nowLoc = aud.nowFor(r)
    const remLoc = naiveIso(r.reminder_date)
    const overdue = remLoc < nowLoc
    if (!overdue && remLoc.slice(0, 10) !== nowLoc.slice(0, 10)) continue  // es de otro día
    if (overdue && !r.push_sent) missed.push(r.id)
    if (!aud.canNotify(r)) continue

    const day = days.get(r.user_id) ?? { today: [], overdue: 0, recent: 0 }
    if (!overdue) day.today.push(r)
    else {
      day.overdue++
      if (msBetween(remLoc, nowLoc) <= 24 * 3600_000) day.recent++
    }
    days.set(r.user_id, day)
  }

  let users = 0, sent = 0
  for (const [userId, day] of days) {
    // Pendientes vencidos de hace días, sin nada nuevo: no despertar a nadie cada mañana
    if (!day.today.length && !day.recent) continue
    const devices = aud.devices.get(userId)
    if (!devices?.length) continue
    users++
    const result = await sendPushToSubscriptions(devices, agendaPayload(day), { urgency: 'normal', ttl: 4 * 3600 })
    sent += result.sent
  }
  await markSent(missed)
  return { users, sent, missed: missed.length }
}
