import webpush from 'web-push'
import { getServerSupabase } from './supabase-server'

export type PushSub = { endpoint: string; p256dh: string; auth: string }
export type PushPayload = { title: string; body: string; url: string; tag?: string }

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
export async function sendPushToSubscriptions(subs: PushSub[], payload: PushPayload) {
  let sent = 0
  let failed = 0
  const expired: string[] = []
  const body = JSON.stringify(payload)

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 60 * 60 })
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
