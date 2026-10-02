/**
 * Cerrar sesión en el navegador. Antes da de baja las notificaciones push de
 * este dispositivo: en un equipo compartido, quien entre después no debe
 * recibir los avisos (nombres de clientes, mensajes) del usuario anterior.
 */
export async function signOut(redirectTo: string | null = '/login') {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
      await sub.unsubscribe()
    }
  } catch {}
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  if (redirectTo) window.location.href = redirectTo
  else window.location.reload()
}
