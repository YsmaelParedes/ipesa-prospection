import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getServerSupabase } from './supabase-server'
import { sendPushToSubscriptions, type PushPayload, type PushSub } from './push'
import { remTypeInfo } from './crm'
import { DEFAULT_TZ, naiveIso, zonedIso } from './datetime'

/**
 * Avisos push personales de la Agenda (cada uno va solo a los dispositivos de
 * su dueño; los de WhatsApp, en cambio, son para todo el equipo de la tienda):
 *  · A la hora de cada recordatorio: un Worker de Cloudflare (workers/avisos)
 *    llama cada minuto a /api/cron/reminders. El reloj vive fuera de la base:
 *    cada vuelta es una lectura sobre un índice parcial y solo se escribe
 *    cuando de verdad toca avisar (pg_cron agotaba el Disk IO de Supabase).
 *  · Resumen de la mañana: el cron diario de Vercel llama a /api/cron/agenda.
 *    Junta los recordatorios de cada persona y sus seguimientos del sistema
 *    comercial (contacts.next_action_at de los clientes a su cargo), igual que
 *    la pantalla Agenda.
 * reminder_date no lleva zona: es la hora LOCAL de la tienda tal cual se
 * eligió, así que "ahora" se expresa igual (zonedIso) y se compara como texto.
 * Recorren todas las tiendas a propósito: cada recordatorio es personal y solo
 * va a los dispositivos de quien lo creó.
 */

/* ── Quién puede llamar a los crons ─────────────────────────────────────── */

const KEY_CACHE_MS = 5 * 60_000
let keyCache: { hashes: Buffer[]; at: number } | null = null

/** Resúmenes SHA-256 de las llaves de los relojes externos (tabla cron_keys). */
async function cronKeyHashes(): Promise<Buffer[]> {
  if (keyCache && Date.now() - keyCache.at < KEY_CACHE_MS) return keyCache.hashes
  const { data, error } = await getServerSupabase().from('cron_keys').select('key_hash')
  if (error) throw error
  const hashes = (data ?? []).map(k => Buffer.from(String(k.key_hash), 'hex')).filter(b => b.length === 32)
  keyCache = { hashes, at: Date.now() }
  return hashes
}

/**
 * El cron de Vercel manda CRON_SECRET. Con `allowKeys`, también una llave de
 * cron_keys: la base guarda solo su resumen y la llave vive en el Worker, así
 * que no hay un secreto que copiar entre servicios. Sin ninguno de los dos no
 * entra nadie (falla cerrado).
 */
export async function authorizeCron(req: NextRequest, { allowKeys = false } = {}): Promise<boolean> {
  const header = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (secret) {
    const expected = `Bearer ${secret}`
    if (header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))) return true
  }
  if (!allowKeys) return false
  const token = /^Bearer ([0-9a-f]{64})$/.exec(header)?.[1]
  if (!token) return false
  const hash = createHash('sha256').update(token).digest()
  try {
    return (await cronKeyHashes()).some(h => timingSafeEqual(h, hash))
  } catch (err) {
    console.error('[cron] no se pudieron leer las llaves', err)
    return false
  }
}

/* ── Destinatarios ──────────────────────────────────────────────────────── */

export type Row = {
  id: string; store_id: string; user_id: string
  lead_name: string | null; nota: string | null; reminder_date: string; type: string | null
  push_sent?: boolean
}

const uniq = <T>(list: T[]) => [...new Set(list)]

/** Zona de cada tienda, quién sigue en su equipo y los dispositivos de cada persona. */
async function loadAudience(rows: { store_id: string; user_id: string }[], now: Date) {
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
    canNotify: (r: { store_id: string; user_id: string }) => allowed.has(`${r.store_id}:${r.user_id}`),
    /** "Ahora" en la hora local de la tienda del recordatorio. */
    nowFor(r: { store_id: string }) {
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

/** El aviso de un recordatorio: qué hacer y con quién, y su nota. */
export function reminderPayload(r: Row, lateMs = 0): PushPayload {
  const action = actionFor(r)
  const nota = r.nota?.trim() || ''
  const late = lateMs >= 15 * 60_000  // salió con retraso: que se vea la hora original
  const time = hhmm(r.reminder_date)
  const at = `${/^1:/.test(time) ? 'la' : 'las'} ${time}`  // "de la 1:30", "de las 2:30"
  const when = late ? `Pendiente desde ${at}` : `Recordatorio de ${at}`
  // La nota va en el título si no hay cliente; si lo hay, en el cuerpo
  const body = action && nota ? (late ? `${nota} · ${when.toLowerCase()}` : nota) : when
  return {
    title: clip(action ? `${remTypeInfo(r.type).emoji} ${action}` : `⏰ ${nota || 'Recordatorio'}`, 70),
    body:  clip(body, 180),
    url:   '/recordatorios',
    tag:   `rem-${r.id}`,
    sticky: true,
  }
}

/** Lo de hoy de una persona: cada renglón con su orden (la hora; los seguimientos, sin hora, al final). */
export type AgendaDay = { today: { sort: string; line: string }[]; overdue: number; recent: number }

type FollowUp = { id: string; store_id: string; owner_id: string; name: string; company: string | null; next_action: string | null; next_action_at: string }

const reminderLine = (r: Row) => ({
  sort: naiveIso(r.reminder_date).slice(11, 16),
  line: `${hhmm(r.reminder_date)} ${clip(actionFor(r) ?? (r.nota?.trim() || 'Recordatorio'), 46)}`,
})
const followupLine = (c: FollowUp) => ({ sort: '99:99', line: clip(`${c.next_action?.trim() || 'Seguimiento'}: ${c.company?.trim() || c.name}`, 52) })

export function agendaPayload({ today: items, overdue }: AgendaDay): PushPayload {
  const s = (n: number) => (n === 1 ? '' : 's')
  const today = [...items].sort((a, b) => a.sort.localeCompare(b.sort))
  const lines = today.slice(0, 3).map(t => t.line)
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
export const LATE_LIMIT_MS = 6 * 3600_000
/** Si ningún dispositivo lo recibió, se reintenta en las siguientes vueltas durante este tiempo. */
const RETRY_FOR_MS = 10 * 60_000

type DueRow = Row & { stores: { timezone: string | null } | null }

/**
 * Cuánto se pasó cada recordatorio de su hora (en la zona de su tienda); solo
 * los que ya llegaron. reminder_date y "ahora" son horas locales sin zona.
 */
export function dueReminders<T extends { reminder_date: string }>(rows: T[], nowIn: (row: T) => string) {
  return rows
    .map(r => ({ r, lateMs: msBetween(naiveIso(r.reminder_date), nowIn(r)) }))
    .filter(d => d.lateMs >= 0)
}

/**
 * Un aviso por cada recordatorio cuya hora ya llegó y que aún no se avisó,
 * solo a los dispositivos de su dueño. Casi siempre no hay nada: entonces es
 * una sola lectura sobre reminders_pending_push_idx y nada se escribe.
 */
export async function sendDueReminders(now = new Date()) {
  const supabase = getServerSupabase()
  // Cota amplia (la zona más adelantada es UTC+14); luego cada tienda con su hora
  const bound = new Date(now.getTime() + 14 * 3600_000).toISOString().slice(0, 19)
  const { data, error } = await supabase
    .from('reminders')
    .select('id, store_id, user_id, lead_name, nota, reminder_date, type, stores(timezone)')
    .eq('completado', false)
    .eq('push_sent', false)
    .not('user_id', 'is', null)
    .lte('reminder_date', bound)
    .order('reminder_date', { ascending: true })
    .limit(200)
  if (error) throw error
  const empty = { due: 0, sent: 0, failed: 0, expired: 0, retry: 0, skipped: 0 }
  const rows = (data ?? []) as unknown as DueRow[]
  if (!rows.length) return empty

  const nowByZone = new Map<string, string>()
  const due = dueReminders(rows, r => {
    const tz = r.stores?.timezone || DEFAULT_TZ
    let iso = nowByZone.get(tz)
    if (!iso) { iso = zonedIso(now, tz); nowByZone.set(tz, iso) }
    return iso
  })
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
  const toSend = due.filter(d => mine.has(d.r.id))
  if (!toSend.length) return { ...empty, due: due.length }

  const aud = await loadAudience(toSend.map(d => d.r), now)
  let sent = 0, failed = 0, expired = 0, skipped = 0
  const retry: string[] = []
  for (const { r, lateMs } of toSend) {
    // Muy atrasado, sin dueño vigente o sin dispositivos: queda marcado sin aviso
    const devices = aud.devices.get(r.user_id)
    if (lateMs > LATE_LIMIT_MS || !aud.canNotify(r) || !devices?.length) { skipped++; continue }

    const result = await sendPushToSubscriptions(devices, reminderPayload(r, lateMs), { ttl: 2 * 3600 })
    sent += result.sent
    failed += result.failed
    expired += result.expired.length
    if (result.expired.length) aud.devices.set(r.user_id, devices.filter(d => !result.expired.includes(d.endpoint)))
    if (result.sent === 0 && result.failed > 0 && lateMs < RETRY_FOR_MS) retry.push(r.id)
  }
  if (retry.length) await supabase.from('reminders').update({ push_sent: false }).in('id', retry)
  return { due: due.length, sent, failed, expired, retry: retry.length, skipped }
}

/* ── Resumen de la mañana ───────────────────────────────────────────────── */

/** Un solo aviso por persona con lo que tiene hoy y cuántos pendientes se le vencieron. */
export async function sendMorningAgenda(now = new Date()) {
  const supabase = getServerSupabase()
  // Hasta el fin del día en la zona más adelantada (UTC+14 → 38 h desde ahora)
  const bound = new Date(now.getTime() + 38 * 3600_000).toISOString().slice(0, 19)
  const [reminders, followups] = await Promise.all([
    supabase.from('reminders')
      .select('id, store_id, user_id, lead_name, nota, reminder_date, type, push_sent')
      .eq('completado', false)
      .not('user_id', 'is', null)
      .lte('reminder_date', bound)
      .order('reminder_date', { ascending: true })
      .limit(5000),
    // Seguimientos comerciales con fecha de hoy o vencida, de quien tiene al cliente
    supabase.from('contacts')
      .select('id, store_id, owner_id, name, company, next_action, next_action_at')
      .not('owner_id', 'is', null)
      .not('next_action_at', 'is', null)
      .lte('next_action_at', bound.slice(0, 10))
      .neq('commercial_status', 'depurar')
      .order('next_action_at', { ascending: true })
      .limit(5000),
  ])
  const error = reminders.error ?? followups.error
  if (error) throw error
  const rows = (reminders.data ?? []) as Row[]
  const due = (followups.data ?? []) as FollowUp[]
  if (!rows.length && !due.length) return { users: 0, sent: 0, missed: 0, stalled: 0, followups: 0 }

  const aud = await loadAudience([...rows, ...due.map(c => ({ store_id: c.store_id, user_id: c.owner_id }))], now)
  const days = new Map<string, AgendaDay>()
  const dayOf = (userId: string) => {
    const day = days.get(userId) ?? { today: [], overdue: 0, recent: 0 }
    days.set(userId, day)
    return day
  }
  // Vencidos que nunca se avisaron uno por uno: el resumen cuenta como su aviso.
  // Si alguno es de las últimas 24 h, el reloj de cada minuto no está corriendo.
  const missed: string[] = []
  let stalled = 0
  for (const r of rows) {
    const nowLoc = aud.nowFor(r)
    const remLoc = naiveIso(r.reminder_date)
    const overdue = remLoc < nowLoc
    if (!overdue && remLoc.slice(0, 10) !== nowLoc.slice(0, 10)) continue  // es de otro día
    if (overdue && !r.push_sent) {
      missed.push(r.id)
      const late = msBetween(remLoc, nowLoc)
      if (late > 15 * 60_000 && late <= 24 * 3600_000) stalled++
    }
    if (!aud.canNotify(r)) continue

    const day = dayOf(r.user_id)
    if (!overdue) day.today.push(reminderLine(r))
    else {
      day.overdue++
      if (msBetween(remLoc, nowLoc) <= 24 * 3600_000) day.recent++
    }
  }

  // Seguimientos: la fecha es un día (sin hora) en la zona de la tienda
  let followupCount = 0
  for (const c of due) {
    const target = { store_id: c.store_id, user_id: c.owner_id }
    if (!aud.canNotify(target)) continue
    const todayLoc = aud.nowFor(c).slice(0, 10)
    if (c.next_action_at > todayLoc) continue  // en esta zona todavía es de mañana
    followupCount++
    const day = dayOf(c.owner_id)
    if (c.next_action_at === todayLoc) day.today.push(followupLine(c))
    else {
      day.overdue++
      // Vencido desde ayer cuenta como "nuevo" (sí despierta el aviso)
      if (msBetween(`${c.next_action_at}T00:00:00`, `${todayLoc}T00:00:00`) <= 24 * 3600_000) day.recent++
    }
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
  return { users, sent, missed: missed.length, stalled, followups: followupCount }
}
