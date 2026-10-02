import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  isStoreAdminRole, normalizeModules, storeAccess,
  type StoreAccess, type StoreModule, type StoreModules, type StoreRole, type StoreStatus,
} from './stores'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Cookie con la tienda activa (solo una preferencia: se valida contra la membresía). */
export const ACTIVE_STORE_COOKIE = 'crm_store'

// ─── Cliente admin (service key) — para operaciones de datos en API routes ───
// Bypasses RLS: el aislamiento entre tiendas y los permisos se aplican aquí,
// en el servidor, con el contexto de requireStore(). anon/authenticated no
// tienen privilegios sobre las tablas.
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

export function displayNameOf(user: Pick<User, 'user_metadata' | 'email'>): string {
  return (user.user_metadata?.display_name as string | undefined)?.trim() || user.email?.split('@')[0] || 'Usuario'
}

// getUser() valida el JWT contra Supabase Auth (a diferencia de getSession(),
// que solo lee la cookie) — es lo correcto para autorizar.
export async function getSessionUser(): Promise<User | null> {
  try {
    const client = await getAuthClient()
    const { data: { user }, error } = await client.auth.getUser()
    return error || !user ? null : user
  } catch {
    return null
  }
}

// ─── Tiendas ─────────────────────────────────────────────────────────────────
export const STORE_COLUMNS =
  'id, slug, name, phone, email, address, city, state, logo_path, timezone, status, plan, trial_ends_at, paid_until, modules, onboarding_completed_at, created_at'

export type StoreRow = {
  id: string; slug: string; name: string
  phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null
  logo_path: string | null; timezone: string
  status: StoreStatus; plan: string; trial_ends_at: string | null; paid_until: string | null
  modules: StoreModules; onboarding_completed_at: string | null; created_at: string
}

export type Membership = { storeId: string; role: StoreRole; store: StoreRow }

export type StoreContext = {
  uid: string
  user: User
  storeId: string
  role: StoreRole
  /** Dueño o administrador de la tienda activa */
  isAdmin: boolean
  isOwner: boolean
  store: StoreRow
  access: StoreAccess
  memberships: Membership[]
}

// Membresías por usuario: se consultan en cada petición; se cachean 10 s por
// instancia para no repetir la consulta en ráfagas (la bandeja hace varias).
const membershipCache = new Map<string, { at: number; list: Membership[] }>()
const MEMBERSHIP_TTL = 10_000

export function invalidateMemberships(uid?: string) {
  if (uid) membershipCache.delete(uid)
  else membershipCache.clear()
}

export async function getMemberships(uid: string): Promise<Membership[]> {
  const hit = membershipCache.get(uid)
  if (hit && Date.now() - hit.at < MEMBERSHIP_TTL) return hit.list
  const { data, error } = await getServerSupabase()
    .from('store_members')
    .select(`store_id, role, created_at, stores!inner(${STORE_COLUMNS})`)
    .eq('user_id', uid)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) throw error
  const list: Membership[] = (data ?? []).map((m: any) => ({
    storeId: m.store_id,
    role: m.role as StoreRole,
    store: { ...m.stores, modules: normalizeModules(m.stores.modules) } as StoreRow,
  }))
  if (membershipCache.size > 2000) membershipCache.clear()
  membershipCache.set(uid, { at: Date.now(), list })
  return list
}

/** Tienda activa: la de la cookie si el usuario pertenece a ella; si no, la más antigua. */
export async function resolveStoreContext(user: User): Promise<StoreContext | null> {
  const memberships = await getMemberships(user.id)
  if (!memberships.length) return null
  const wanted = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value
  const m = memberships.find(x => x.storeId === wanted) ?? memberships[0]
  return {
    uid: user.id,
    user,
    storeId: m.storeId,
    role: m.role,
    isAdmin: isStoreAdminRole(m.role),
    isOwner: m.role === 'owner',
    store: m.store,
    access: storeAccess(m.store),
    memberships,
  }
}

// ─── Respuestas estándar ─────────────────────────────────────────────────────
type ErrorCode = 'UNAUTHENTICATED' | 'NO_STORE' | 'FORBIDDEN' | 'MODULE_DISABLED' | 'STORE_READONLY'

function errorResponse(status: number, code: ErrorCode, error: string) {
  return Response.json({ error, code }, { status })
}

export function unauthorizedResponse() {
  return errorResponse(401, 'UNAUTHENTICATED', 'No autorizado — sesión no válida')
}

export function forbiddenResponse(message = 'Sin permisos de administrador') {
  return errorResponse(403, 'FORBIDDEN', message)
}

/** Exige sesión (sin tienda): registro de tienda, aceptar invitación, push. */
export async function requireUser(): Promise<User | Response> {
  return (await getSessionUser()) ?? unauthorizedResponse()
}

export type RequireStoreOptions = {
  /** La operación escribe datos: se rechaza si la tienda está en solo lectura. */
  write?: boolean
  /** Solo dueño o administrador de la tienda. */
  admin?: boolean
  /** Solo el dueño de la tienda. */
  owner?: boolean
  /** Módulo que debe estar activo en la tienda. */
  module?: StoreModule
}

/**
 * Punto de entrada de toda ruta con datos de una tienda. Devuelve el contexto
 * (usuario, tienda activa, rol) o la respuesta de error lista para retornar.
 * Toda consulta debe filtrar por ctx.storeId y toda inserción llevarlo.
 */
export async function requireStore(opts: RequireStoreOptions = {}): Promise<StoreContext | Response> {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  let ctx: StoreContext | null
  try {
    ctx = await resolveStoreContext(user)
  } catch (error) {
    console.error('[requireStore]', error)
    return Response.json({ error: 'Error al cargar la tienda' }, { status: 500 })
  }
  if (!ctx) return errorResponse(403, 'NO_STORE', 'Tu cuenta no pertenece a ninguna tienda todavía')
  if (opts.owner && !ctx.isOwner) return forbiddenResponse('Solo el dueño de la tienda puede hacer esto')
  if (opts.admin && !ctx.isAdmin) return forbiddenResponse()
  if (opts.module && !ctx.store.modules[opts.module]) {
    return errorResponse(403, 'MODULE_DISABLED', 'Este módulo está desactivado para tu tienda')
  }
  if (opts.write && ctx.access === 'readonly') {
    return errorResponse(402, 'STORE_READONLY',
      'Tu tienda está en modo solo lectura: el periodo de prueba terminó o la suscripción no está vigente.')
  }
  return ctx
}

// ─── Plataforma (dueño del SaaS) ──────────────────────────────────────────────
export async function isPlatformAdmin(uid: string): Promise<boolean> {
  const { data } = await getServerSupabase().from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle()
  return !!data
}

export async function requirePlatformAdmin(): Promise<User | Response> {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!(await isPlatformAdmin(user.id))) return forbiddenResponse('Solo para administradores de la plataforma')
  return user
}

// ─── Equipo de la tienda (nombres para mostrar dueño de leads) ────────────────
export type StoreMember = {
  user_id: string; email: string; display_name: string; role: StoreRole; status: string
  joined_at: string; last_sign_in_at: string | null
}

const directoryCache = new Map<string, { at: number; list: StoreMember[] }>()
export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  const hit = directoryCache.get(storeId)
  if (hit && Date.now() - hit.at < 60_000) return hit.list
  const { data, error } = await getServerSupabase().rpc('store_member_directory', { p_store: storeId })
  if (error) throw error
  const list = (data ?? []) as StoreMember[]
  if (directoryCache.size > 1000) directoryCache.clear()
  directoryCache.set(storeId, { at: Date.now(), list })
  return list
}

export async function getUserNameMap(storeId: string): Promise<Map<string, string>> {
  return new Map((await getStoreMembers(storeId)).map(m => [m.user_id, m.display_name]))
}

export function invalidateStoreMembers(storeId?: string) {
  if (storeId) directoryCache.delete(storeId)
  else directoryCache.clear()
  invalidateMemberships()
}
