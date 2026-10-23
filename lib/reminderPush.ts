import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { getServerSupabase } from './supabase-server'
import { sendPushToSubscriptions, type PushPayload, type PushSub } from './push'
import { DEFAULT_TZ, naiveIso, zonedIso } from './datetime'

/**
 * Avisos push de la Agenda: el resumen de la mañana, que el cron diario de
 * Vercel pide a /api/cron/agenda. (Los avisos a la hora de cada recordatorio
 * se quitaron el 22 de octubre de 2026; volverán con un plan mayor de Supabase.)
 * reminder_date no lleva zona: es la hora LOCAL de la tienda tal cual se
 * eligió, así que "ahora" se expresa igual (zonedIso) y se compara como texto.
 * Recorren todas las tiendas a propósito: cada recordatorio es personal y solo
 * va a los dispositivos de su dueño.
 */

/* ── Quién puede llamar a los crons ─────────────────────────────────────── */

/** Solo el cron de Vercel, con CRON_SECRET. Sin él no entra nadie (falla cerrado). */
export async function authorizeCron(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = `Bearer ${secret}`
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
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
