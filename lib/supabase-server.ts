import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_KEY ?? SUPABASE_ANON

// ─── Cliente admin (service key) — para operaciones de datos en API routes ───
// Bypasses RLS; filtrado multi-usuario se hace a nivel de aplicación.
export function getServerSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SVC, { auth: { persistSession: false } })
}

// ─── Cliente auth-aware con cookies — para leer la sesión del usuario ─────────
export async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })
}

// ─── Helper principal: obtiene el user_id del usuario autenticado ─────────────
// Retorna string si hay sesión válida, null si no hay sesión.
// Usado en todos los API routes que requieren aislamiento por usuario.
export async function getUserId(): Promise<string | null> {
  try {
    const client = await getAuthClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return null
    return user.id
  } catch {
    return null
  }
}

// ─── Respuesta 401 estándar ────────────────────────────────────────────────────
export function unauthorizedResponse() {
  return Response.json({ error: 'No autorizado — sesión no válida' }, { status: 401 })
}
