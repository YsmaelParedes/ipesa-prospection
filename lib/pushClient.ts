/**
 * Avisos push en el navegador (solo para componentes de cliente): activar,
 * desactivar y probar los avisos de ESTE dispositivo. Los usan Configuración →
 * Mi cuenta y el recordatorio para activarlos en la barra de la app.
 */

export type PushSupport = 'ok' | 'ios-install' | 'unsupported'

/** Avisa al shell (campana y barra) que cambió la suscripción de este dispositivo. */
export const notifyPushChanged = () => window.dispatchEvent(new Event('crm:push-changed'))

/** En iPhone/iPad los avisos solo existen con la app agregada a la pantalla de inicio. */
export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok'
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !installed ? 'ios-install' : 'unsupported'
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null))
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await (await getRegistration())?.pushManager.getSubscription()) ?? null
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output.buffer as ArrayBuffer
}

async function subscribeDevice(): Promise<PushSubscription> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) throw new Error('Los avisos no están configurados en el servidor.')
  if (!(await getRegistration())) throw new Error('Este navegador no permite avisos.')
  const reg = await navigator.serviceWorker.ready  // suscribirse requiere el service worker activo
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
}

async function saveSubscription(sub: PushSubscription, notifyWhatsapp?: boolean) {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...sub.toJSON(), ...(notifyWhatsapp === undefined ? {} : { notifyWhatsapp }) }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error || 'No se pudo guardar la suscripción')
  }
}

/**
 * Pide permiso, suscribe este dispositivo y lo registra a nombre del usuario.
 * Debe llamarse desde un toque/clic (el navegador lo exige para pedir permiso).
 */
export async function enableDevicePush(notifyWhatsapp?: boolean): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  const sub = (await currentSubscription()) ?? (await subscribeDevice())
  await saveSubscription(sub, notifyWhatsapp)
  notifyPushChanged()
  return permission
}

/* ── Reactivar los avisos al volver a entrar ──
 * Al cerrar sesión se dan de baja los avisos de este dispositivo: en un equipo
 * compartido, quien entre después no debe recibir los de la persona anterior.
 * Aquí se anota quién los tenía activos para reactivarlos sin preguntar cuando
 * ESA persona vuelva a entrar en este navegador (el permiso ya lo había dado).
 * Otra persona que entre en el mismo equipo los activa ella misma.
 */
const RESUME_KEY = 'crm:push:resume'
const RESUME_MAX_AGE_MS = 180 * 86_400_000
type ResumeMap = Record<string, { notifyWhatsapp: boolean; at: number }>

function readResume(): ResumeMap {
  try {
    const value = JSON.parse(window.localStorage.getItem(RESUME_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function writeResume(map: ResumeMap) {
  try {
    if (Object.keys(map).length) window.localStorage.setItem(RESUME_KEY, JSON.stringify(map))
    else window.localStorage.removeItem(RESUME_KEY)
  } catch {}
}

/** Al cerrar sesión: anota que esta persona tenía los avisos activos aquí (y si quería los de WhatsApp). */
export async function rememberDevicePush(userId: string, endpoint: string) {
  const res = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`).catch(() => null)
  const d = res?.ok ? await res.json().catch(() => null) : null
  if (!d?.subscribed) return
  writeResume({ ...readResume(), [userId]: { notifyWhatsapp: d.notifyWhatsapp !== false, at: Date.now() } })
}

/** Ya no reactivarlos solos (los apagó a propósito). */
export function forgetDevicePush(userId: string) {
  const map = readResume()
  if (!map[userId]) return
  delete map[userId]
  writeResume(map)
}

/**
 * Al entrar: si esta persona tenía los avisos en este dispositivo y el navegador
 * conserva el permiso, se vuelven a activar sin mostrarle la sugerencia.
 */
export async function resumeDevicePush(userId: string): Promise<boolean> {
  const saved = readResume()[userId]
  if (!saved) return false
  if (Date.now() - saved.at > RESUME_MAX_AGE_MS || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    forgetDevicePush(userId)
    return false
  }
  try {
    const sub = (await currentSubscription()) ?? (await subscribeDevice())
    await saveSubscription(sub, saved.notifyWhatsapp)
    forgetDevicePush(userId)
    notifyPushChanged()
    return true
  } catch {
    return false  // se queda la sugerencia para activarlos con un toque
  }
}

export async function disableDevicePush(userId?: string) {
  if (userId) forgetDevicePush(userId)
  const sub = await currentSubscription()
  if (sub) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
  notifyPushChanged()
}

export type TestResult = { ok: true } | { ok: false; error: string; inactive?: boolean }

/**
 * Aviso de prueba solo a este dispositivo. Si su registro se perdió o caducó,
 * lo renueva una vez (con la preferencia de WhatsApp que se indique).
 */
export async function testDevicePush(opts: { notifyWhatsapp?: boolean } = {}, retried = false): Promise<TestResult> {
  const sub = await currentSubscription()
  if (!sub) return { ok: false, inactive: true, error: 'Este dispositivo ya no tiene los avisos activos. Vuelve a activarlos.' }

  const res = await fetch('/api/push/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  const d = await res.json().catch(() => ({}))
  if (res.ok && d.sent > 0) return { ok: true }

  if (!retried && (d.code === 'NOT_REGISTERED' || d.expired > 0)) {
    let fresh = sub
    if (d.expired > 0) {
      await sub.unsubscribe().catch(() => {})
      fresh = await subscribeDevice()
    }
    await saveSubscription(fresh, opts.notifyWhatsapp)
    return testDevicePush(opts, true)
  }
  return {
    ok: false,
    error: d.error || (d.failed
      ? 'El servicio de avisos del navegador no respondió. Intenta de nuevo en un momento.'
      : 'No se pudo enviar la prueba.'),
  }
}
