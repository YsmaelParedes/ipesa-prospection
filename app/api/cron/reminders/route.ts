import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getServerSupabase } from '@/lib/supabase-server'
import { configureWebPush, sendPushToSubscriptions } from '@/lib/push'

export const dynamic = 'force-dynamic'

// reminder_date es `timestamp without time zone` y guarda la hora LOCAL de
// México tal cual la eligió el usuario. Para compararla hay que expresar
// "ahora" también como hora local de México (el servidor corre en UTC).
const TZ = 'America/Mexico_City'
function mexicoLocalIso(date: Date): string {
  // 'sv-SE' produce "YYYY-MM-DD HH:MM:SS"
  return date.toLocaleString('sv-SE', { timeZone: TZ, hour12: false }).replace(' ', 'T')
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}

// Corre una vez al día a las 14:00 UTC (0 14 * * *) = 8:00 a.m. en México
// (UTC-6 todo el año desde que se eliminó el horario de verano en 2022).
// Envía una notificación INDIVIDUAL por cada recordatorio pendiente:
//   · vencidos (overdue)
//   · programados para las próximas 25 h
// La columna push_sent evita reenvíos si el cron corre dos veces en el mismo día.
// Recorre las tiendas de toda la plataforma a propósito: cada recordatorio es
// personal y solo se envía a los dispositivos de su propio dueño (user_id).
export async function GET(req: NextRequest) {
  // Falla cerrado: sin CRON_SECRET configurado nadie puede dispararlo.
  if (!authorized(req)) {
    if (!process.env.CRON_SECRET) console.error('[cron/reminders] CRON_SECRET no configurado — cron deshabilitado')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!configureWebPush()) {
    console.error('[cron/reminders] VAPID keys no configuradas')
    return NextResponse.json({ error: 'VAPID keys no configuradas.' }, { status: 500 })
  }

  const supabase   = getServerSupabase()
  const nowLocal   = mexicoLocalIso(new Date())
  const horizonLoc = mexicoLocalIso(new Date(Date.now() + 25 * 60 * 60 * 1000))

  const { data: reminders, error: remError } = await supabase
    .from('reminders')
    .select('id, store_id, user_id, lead_name, nota, reminder_date')
    .eq('completado', false)
    .eq('push_sent', false)
    .not('user_id', 'is', null)
    .lte('reminder_date', horizonLoc)
    .order('reminder_date', { ascending: true })

  if (remError) {
    console.error('[cron/reminders] error reminders:', remError.message)
    return NextResponse.json({ error: 'Error al consultar recordatorios' }, { status: 500 })
  }
  if (!reminders?.length) {
    return NextResponse.json({ sent: 0, note: 'Sin recordatorios para notificar' })
  }

  const userIds  = [...new Set(reminders.map(r => r.user_id as string))]
  const storeIds = [...new Set(reminders.map(r => r.store_id as string))]
  const [{ data: subs, error: subsError }, { data: members, error: membersError }, { data: stores, error: storesError }] = await Promise.all([
    supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', userIds),
    supabase.from('store_members').select('store_id, user_id').in('store_id', storeIds).in('user_id', userIds).eq('status', 'active'),
    supabase.from('stores').select('id, status').in('id', storeIds),
  ])

  if (subsError || membersError || storesError) {
    console.error('[cron/reminders] error:', (subsError ?? membersError ?? storesError)?.message)
    return NextResponse.json({ error: 'Error al consultar suscripciones' }, { status: 500 })
  }

  // Solo quien sigue en el equipo de una tienda vigente recibe sus avisos
  // (el texto lleva nombres y notas de clientes de esa tienda).
  const liveStores = new Set((stores ?? []).filter(s => s.status === 'trial' || s.status === 'active').map(s => s.id))
  const allowed = new Set((members ?? []).filter(m => liveStores.has(m.store_id)).map(m => `${m.store_id}:${m.user_id}`))

  const subsByUser = new Map<string, NonNullable<typeof subs>>()
  for (const sub of subs ?? []) {
    if (!subsByUser.has(sub.user_id)) subsByUser.set(sub.user_id, [])
    subsByUser.get(sub.user_id)!.push(sub)
  }

  let sent = 0
  let failed = 0
  let expired = 0
  const notifiedIds: string[] = []

  for (const rem of reminders) {
    if (!allowed.has(`${rem.store_id}:${rem.user_id}`)) { notifiedIds.push(rem.id); continue }
    const userSubs = subsByUser.get(rem.user_id as string)
    // Sin suscripción → marcar igual para no reintentar cada día
    if (!userSubs?.length) { notifiedIds.push(rem.id); continue }

    // Ambos son hora local de México en formato ISO → comparables como texto
    const remLocal  = String(rem.reminder_date).slice(0, 19)
    const isOverdue = remLocal < nowLocal
    const title = isOverdue ? '⏰ Recordatorio vencido' : `🔔 Hoy a las ${remLocal.slice(11, 16)}`
    const body  = rem.nota?.trim() || rem.lead_name?.trim() || 'Recordatorio pendiente'

    const result = await sendPushToSubscriptions(userSubs, { title, body, url: '/recordatorios', tag: `rem-${rem.id}` })
    sent += result.sent
    failed += result.failed
    expired += result.expired.length
    // Notificado si llegó a algún dispositivo, o si todos estaban dados de baja
    if (result.sent > 0 || result.expired.length === userSubs.length) notifiedIds.push(rem.id)
    // Suscripciones expiradas ya se borraron: no volver a intentarlas
    const gone = new Set(result.expired)
    subsByUser.set(rem.user_id as string, userSubs.filter(s => !gone.has(s.endpoint)))
  }

  if (notifiedIds.length) {
    await supabase.from('reminders').update({ push_sent: true }).in('id', notifiedIds)
  }

  console.log(`[cron/reminders] ok — enviadas: ${sent}, fallidas: ${failed}, recordatorios: ${reminders.length}, expiradas: ${expired}`)
  return NextResponse.json({ sent, failed, reminders: reminders.length, expired })
}
