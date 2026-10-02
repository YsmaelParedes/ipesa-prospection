import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── Cliente admin (service key) — para operaciones de datos en API routes ───
// Bypasses RLS; los permisos (dueño del lead, rol admin) se validan en cada
// route. anon/authenticated no tienen privilegios sobre las tablas, así que
// sin la service key la app no puede leer datos: se falla con un error claro
// en vez de caer silenciosamente a la anon key.
let serviceClient: SupabaseClient | null = null
export function getServerSupabase(): SupabaseClient {
  if (serviceClient) return serviceClient
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_KEY no está configurada en el entorno')
  serviceClient = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return serviceClient
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

export type UserRole = 'admin' | 'employee'
export type UserContext = { uid: string; role: UserRole; user: User }

/**
 * El rol vive en app_metadata, que SOLO se puede modificar con la service
 * key. Nunca leerlo de user_metadata: el propio usuario puede reescribir ese
 * campo desde el navegador (supabase.auth.updateUser) y volverse admin.
 */
export function roleOf(user: Pick<User, 'app_metadata'>): UserRole {
  return user.app_metadata?.role === 'admin' ? 'admin' : 'employee'
}

export function displayNameOf(user: Pick<User, 'user_metadata' | 'email'>): string {
  return (user.user_metadata?.display_name as string | undefined)?.trim() || user.email || 'Usuario'
}

// getUser() valida el JWT contra Supabase Auth (a diferencia de getSession(),
// que solo lee la cookie) — es lo correcto para autorizar.
export async function getUserContext(): Promise<UserContext | null> {
  try {
    const client = await getAuthClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return null
    return { uid: user.id, role: roleOf(user), user }
  } catch {
    return null
  }
}

export async function getUserId(): Promise<string | null> {
  return (await getUserContext())?.uid ?? null
}

// ─── Respuestas estándar ─────────────────────────────────────────────────────
export function unauthorizedResponse() {
  return Response.json({ error: 'No autorizado — sesión no válida' }, { status: 401 })
}

export function forbiddenResponse(message = 'Sin permisos de administrador') {
  return Response.json({ error: message }, { status: 403 })
}

/** Exige sesión; devuelve el contexto o la respuesta 401 lista para retornar. */
export async function requireUser(): Promise<UserContext | Response> {
  return (await getUserContext()) ?? unauthorizedResponse()
}

/** Exige sesión de administrador (401 sin sesión, 403 si no es admin). */
export async function requireAdmin(): Promise<UserContext | Response> {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') return forbiddenResponse()
  return ctx
}

// ─── Nombres de usuarios (para mostrar dueño de leads) ────────────────────────
// listUsers es una llamada de red a Auth; se cachea 60 s por instancia para no
// repetirla en cada carga de Leads/Dashboard.
let nameCache: { at: number; map: Map<string, string> } | null = null
export async function getUserNameMap(): Promise<Map<string, string>> {
  if (nameCache && Date.now() - nameCache.at < 60_000) return nameCache.map
  const { data, error } = await getServerSupabase().auth.admin.listUsers({ perPage: 200 })
  if (error) throw error
  const map = new Map(data.users.map(u => [u.id, displayNameOf(u)]))
  nameCache = { at: Date.now(), map }
  return map
}

export function invalidateUserNameCache() {
  nameCache = null
}
