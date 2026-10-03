import webpush from 'web-push'
import { getServerSupabase } from './supabase-server'

export type PushSub = { endpoint: string; p256dh: string; auth: string }
/**
 * Lo que recibe public/sw.js. `sticky`: el aviso se queda en pantalla hasta
 * que lo atiendan. `renotify`: vuelve a sonar aunque reemplace a otro con la
 * misma etiqueta (mensajes nuevos de un mismo chat).
 */
export type PushPayload = { title: string; body: string; url: string; tag?: string; sticky?: boolean; renotify?: boolean }
export type PushOptions = {
  /** Segundos que el servicio de push guarda el aviso si el dispositivo está apagado. */
  ttl?: number
  /** 'high' entrega al momento aunque el celular esté en ahorro de batería. */
  urgency?: 'normal' | 'high'
}

let configured = false

/** Configura VAPID una sola vez (y nunca al importar: sin llaves no rompe el build). */
export function configureWebPush(): boolean {
  if (configured) return true
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:iysmaelpg@gmail.com', publicKey, privateKey)
  configured = true
  return true
}

/**
 * Envía la misma notificación a varias suscripciones y limpia las que el
 * navegador ya dio de baja (404/410).
 */
export async function sendPushToSubscriptions(subs: PushSub[], payload: PushPayload, opts: PushOptions = {}) {
  let sent = 0
  let failed = 0
  const expired: string[] = []
  const body = JSON.stringify(payload)

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: opts.ttl ?? 60 * 60, urgency: opts.urgency ?? 'high', timeout: 10_000 },
      )
      sent++
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) expired.push(sub.endpoint)
      else { failed++; console.error('[push]', err?.statusCode, err?.message) }
    }
  }))

  if (expired.length) {
    await getServerSupabase().from('push_subscriptions').delete().in('endpoint', expired)
  }
  return { sent, failed, expired }
}
