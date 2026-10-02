/**
 * Invitación que espera la confirmación del correo: si la persona confirma
 * en el mismo dispositivo, /bienvenida la regresa a su invitación en lugar
 * de ofrecerle crear una tienda nueva. Solo es una comodidad del navegador;
 * aceptar sigue exigiendo el enlace y una sesión con ese correo.
 */
const KEY = 'ipesa:pendingInvite'

export function rememberPendingInvite(token: string) {
  try { localStorage.setItem(KEY, token) } catch {}
}

export function forgetPendingInvite() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function pendingInvite(): string | null {
  try {
    const token = localStorage.getItem(KEY)
    return token && /^[A-Za-z0-9_-]{32,64}$/.test(token) ? token : null
  } catch {
    return null
  }
}
