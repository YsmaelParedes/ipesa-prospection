/** Solo servicios de Web Push de navegadores; nunca destinos arbitrarios del usuario. */
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
    return url.hostname === 'fcm.googleapis.com'
      || url.hostname === 'android.googleapis.com'
      || url.hostname === 'updates.push.services.mozilla.com'
      || url.hostname.endsWith('.push.apple.com')
      || url.hostname.endsWith('.notify.windows.com')
  } catch {
    return false
  }
}

/** Las claves Web Push son base64url: punto P-256 sin comprimir y secreto de 16 bytes. */
export function validPushKeys(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return false
  if (!/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}(==)?$/.test(auth)) return false
  const point = Buffer.from(p256dh, 'base64url')
  return point.length === 65 && point[0] === 4 && Buffer.from(auth, 'base64url').length === 16
}
