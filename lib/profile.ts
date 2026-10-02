import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowser } from './supabase'

/**
 * Usuario actual en el navegador. getUser() hace una llamada de red a
 * Supabase Auth; antes cada página la repetía 2-3 veces (nombre, rol…). Se
 * memoiza la promesa durante la vida de la pestaña — con la navegación del
 * lado del cliente (next/link) se resuelve una sola vez por sesión.
 * El rol aquí solo decide qué se MUESTRA; el servidor lo vuelve a validar.
 */
let userPromise: Promise<User | null> | null = null

function currentUser(): Promise<User | null> {
  if (!userPromise) {
    userPromise = createSupabaseBrowser().auth.getUser()
      .then(({ data }) => data.user)
      .catch(() => { userPromise = null; return null })
  }
  return userPromise
}

/** Fuerza a volver a leer el usuario (p. ej. después de editar el perfil). */
export function invalidateCurrentUser() {
  userPromise = null
}

/** display_name de user_metadata → prefijo del email → 'Staff' */
export async function getDisplayName(): Promise<string> {
  const user = await currentUser()
  if (!user) return 'Staff'
  return (user.user_metadata?.display_name as string)?.trim()
    || user.email?.split('@')[0]
    || 'Staff'
}

/** Rol del usuario actual desde app_metadata (no editable por el usuario). */
export async function getUserRole(): Promise<'admin' | 'employee'> {
  const user = await currentUser()
  return user?.app_metadata?.role === 'admin' ? 'admin' : 'employee'
}
