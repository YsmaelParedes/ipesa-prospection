import { createHash } from 'node:crypto'
import { databaseFetch, measure } from './serverTiming'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_OPTIONS } from './sessionCookie'
import {
  PLAN_FEATURE_REQUIRED, audienceUsers, effectiveModules, effectivePlan, isStoreAdminRole, mainAdminOf, normalizeModules, planOf, storeAccess,
  type PlanFeature, type PlanId, type StoreAccess, type StoreModule, type StoreModules, type StoreRole, type StoreStatus,
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
  serviceClient = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: databaseFetch } })
  return serviceClient
}

// ─── Cliente auth-aware con cookies — para leer la sesión del usuario ─────────
export async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
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

// ─── Caché corta por instancia ───────────────────────────────────────────────
// Cada petición a la API validaba la sesión contra Supabase Auth y volvía a
// leer membresías y tienda: 2 consultas extra por petición, y una pantalla
// pide varias a la vez. Se guarda la promesa (las peticiones simultáneas
// comparten una sola consulta) por unos segundos. Un fallo no se guarda.
type CacheEntry<T> = { until: number; value: Promise<T> }
const CACHE_MAX = 5000

function remember<T>(map: Map<string, CacheEntry<T>>, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = map.get(key)
  if (hit && hit.until > now) return hit.value
  if (map.size >= CACHE_MAX) {
    for (const [k, e] of map) if (e.until <= now) map.delete(k)
    if (map.size >= CACHE_MAX) map.clear()
  }
  const value = load()
  const entry = { until: now + ttl, value }
  map.set(key, entry)
  const forget = () => { if (map.get(key) === entry) map.delete(key) }
  value.then(v => { if (v === null) forget() }, forget)
  return value
}

/** Sesión validada: 30 s por token (nunca más allá de su vencimiento). */
const SESSION_USER_TTL = 30_000
const userCache = new Map<string, CacheEntry<User | null>>()
const tokenKey = (token: string) => createHash('sha256').update(token).digest('base64url')

// getUser() valida el JWT contra Supabase Auth (a diferencia de getSession(),
// que solo lee la cookie) — es lo correcto para autorizar. getSession() solo se
// usa para obtener el token (y renovarlo si venció), nunca para confiar en él.
// Con { fresh: true } se valida otra vez aunque haya una validación reciente
// (cambiar contraseña o nombre).
export async function getSessionUser(opts: { fresh?: boolean } = {}): Promise<User | null> {
  try {
    const client = await getAuthClient()
    const { data: { session } } = await client.auth.getSession()
    const token = session?.access_token
    if (!token) return null
    const key = tokenKey(token)
    if (opts.fresh) userCache.delete(key)
    const expiresIn = session.expires_at ? session.expires_at * 1000 - Date.now() : SESSION_USER_TTL
    const load = async () => {
      const { data: { user }, error } = await measure('auth', () => client.auth.getUser(token))
      return error || !user ? null : user
    }
    if (expiresIn <= 0) return await load()
    return await remember(userCache, key, Math.min(SESSION_USER_TTL, expiresIn), load)
  } catch {
    return null
  }
}

/** Olvida la validación de la sesión de esta petición (al cambiar datos del usuario). */
export async function forgetSessionUser() {
  try {
    const { data: { session } } = await (await getAuthClient()).auth.getSession()
    if (session?.access_token) userCache.delete(tokenKey(session.access_token))
  } catch {}
}

// ─── Tiendas ─────────────────────────────────────────────────────────────────
export const STORE_COLUMNS =
  'id, slug, name, phone, email, address, city, state, logo_path, timezone, status, plan, trial_ends_at, paid_until, modules, onboarding_completed_at, whatsapp_requested_at, created_at, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end'

export type StoreRow = {
  id: string; slug: string; name: string
  phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null
  logo_path: string | null; timezone: string
  status: StoreStatus; plan: string; trial_ends_at: string | null; paid_until: string | null
  modules: StoreModules; onboarding_completed_at: string | null; created_at: string
  /** La tienda pidió activar WhatsApp ("Quiero activarlo") y aún no se activa */
  whatsapp_requested_at: string | null
  /** Suscripción de Stripe (solo servidor: nunca se mandan los ids al navegador) */
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export type Membership = { storeId: string; role: StoreRole; store: StoreRow }

export type StoreContext = {
  uid: string
  user: User
  storeId: string
  role: StoreRole
  /** Administrador de la tienda activa */
  isAdmin: boolean
  store: StoreRow
  access: StoreAccess
  /** Plan que aplica hoy (una cortesía vencida cuenta como Litro) */
  plan: PlanId
  /** Módulos que la tienda puede usar: los de su plan y encendidos por el asesor */
  modules: StoreModules
  /** Plan Litro: solo entra el administrador principal; los demás quedan en espera */
  litroBlocked: boolean
  memberships: Membership[]
}

// Permisos y suscripción vigentes en cada petición, también entre instancias.
export async function getMemberships(uid: string): Promise<Membership[]> {
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
  return list
}

/**
 * Administrador principal: quien abrió la tienda (stores.created_by) si sigue
 * como administrador activo; si no, el administrador activo más antiguo.
 * Nadie más puede quitarlo ni cambiarle el rol, y en el plan Litro (1 usuario)
 * es el único que entra.
 */
export async function getMainAdmin(storeId: string): Promise<string | null> {
  const db = getServerSupabase()
  const [store, admins] = await Promise.all([
    db.from('stores').select('created_by').eq('id', storeId).maybeSingle(),
    db.from('store_members').select('user_id').eq('store_id', storeId).eq('role', 'admin').eq('status', 'active')
      .order('created_at', { ascending: true }).order('user_id', { ascending: true }),
  ])
  return mainAdminOf(store.data?.created_by as string | null | undefined, (admins.data ?? []).map(a => a.user_id as string))
}

export type StoreAudience = { store: { plan: string; paid_until: string | null; modules: unknown; status: string; timezone: string | null }; users: Set<string> }

/**
 * Quién puede recibir avisos con datos de cada tienda (push de WhatsApp,
 * recordatorios, agenda): sus miembros activos y, en el plan Litro, solo el
 * administrador principal, igual que requireStore. Los demás quedan en espera
 * y no deben ver datos de la tienda por ningún canal.
 */
export async function storeAudience(storeIds: string[]): Promise<Map<string, StoreAudience>> {
  const out = new Map<string, StoreAudience>()
  if (!storeIds.length) return out
  const db = getServerSupabase()
  const [stores, members] = await Promise.all([
    db.from('stores').select('id, plan, paid_until, modules, status, timezone, created_by').in('id', storeIds),
    db.from('store_members').select('store_id, user_id, role').in('store_id', storeIds).eq('status', 'active')
      .order('created_at', { ascending: true }).order('user_id', { ascending: true }),
  ])
  const error = stores.error ?? members.error
  if (error) throw error
  for (const s of stores.data ?? []) {
    const rows = (members.data ?? []).filter(m => m.store_id === s.id)
    out.set(s.id, { store: s, users: new Set(audienceUsers(s, rows)) })
  }
  return out
}

/**
 * Membresías y administrador principal: 10 s por instancia. Cambiar permisos,
 * plan o datos de la tienda desde la app borra la caché al momento
 * (invalidateStoreContextCache); otros cambios (otra instancia, la base)
 * tardan como mucho 10 s en verse.
 */
const STORE_CONTEXT_TTL = 10_000
const membershipCache = new Map<string, CacheEntry<Membership[]>>()
const mainAdminCache = new Map<string, CacheEntry<string | null>>()

export function invalidateStoreContextCache() {
  membershipCache.clear()
  mainAdminCache.clear()
}

/** Tienda activa: la de la cookie si el usuario pertenece a ella; si no, la más antigua. */
export async function resolveStoreContext(user: User): Promise<StoreContext | null> {
  const memberships = await remember(membershipCache, user.id, STORE_CONTEXT_TTL, () => getMemberships(user.id))
  if (!memberships.length) return null
  const wanted = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value
  const m = memberships.find(x => x.storeId === wanted) ?? memberships[0]
  const plan = effectivePlan(m.store)
  // Litro incluye 1 usuario: solo el administrador principal (si hay más administradores, quedan en espera)
  const litroBlocked = plan === 'litro' && (m.role !== 'admin' ||
    (await remember(mainAdminCache, m.storeId, STORE_CONTEXT_TTL, () => getMainAdmin(m.storeId))) !== user.id)
  return {
    uid: user.id,
    user,
    storeId: m.storeId,
    role: m.role,
    isAdmin: isStoreAdminRole(m.role),
    store: m.store,
    access: storeAccess(m.store),
    plan,
    modules: effectiveModules(m.store),
    litroBlocked,
    memberships,
  }
}

// ─── Respuestas estándar ─────────────────────────────────────────────────────
type ErrorCode = 'UNAUTHENTICATED' | 'NO_STORE' | 'FORBIDDEN' | 'MODULE_DISABLED' | 'STORE_READONLY' | 'PLAN_ADMIN_ONLY' | 'PLAN_FEATURE'

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
  /** Solo administradores de la tienda. */
  admin?: boolean
  /** Módulo que debe estar activo en la tienda. */
  module?: StoreModule
  /** Función que debe incluir el plan de la tienda (403 PLAN_FEATURE si no). */
  feature?: PlanFeature
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
    ctx = await measure('store', () => resolveStoreContext(user))
  } catch (error) {
    console.error('[requireStore]', error)
    return Response.json({ error: 'Error al cargar la tienda' }, { status: 500 })
  }
  if (!ctx) return errorResponse(403, 'NO_STORE', 'Tu cuenta no pertenece a ninguna tienda todavía')
  if (ctx.litroBlocked) {
    return errorResponse(403, 'PLAN_ADMIN_ONLY', 'Tu tienda está en el plan Litro, que solo incluye al administrador.')
  }
  if (opts.admin && !ctx.isAdmin) return forbiddenResponse()
  if (opts.module && !ctx.modules[opts.module]) {
    return errorResponse(403, 'MODULE_DISABLED', 'Este módulo no está incluido o activado para tu tienda')
  }
  if (opts.write && ctx.access === 'readonly') {
    return errorResponse(402, 'STORE_READONLY',
      'Tu tienda está en modo solo lectura: está suspendida o cancelada.')
  }
  if (opts.feature && !planOf(ctx.plan)[opts.feature]) {
    return errorResponse(403, 'PLAN_FEATURE', PLAN_FEATURE_REQUIRED[opts.feature])
  }
  return ctx
}

// ─── Equipo de la tienda (nombres para mostrar responsables) ─────────────────
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

/** Cambió el equipo de una tienda (roles, altas, bajas, nombres): también los permisos en caché. */
export function invalidateStoreMembers(storeId?: string) {
  if (storeId) { directoryCache.delete(storeId); testCache.delete(storeId) }
  else { directoryCache.clear(); testCache.clear() }
  invalidateStoreContextCache()
}

const testCache = new Map<string, { at: number; ids: Set<string> }>()

/**
 * Cuentas de prueba de la tienda (store_members.is_test): lo que hacen no
 * cuenta en los números del equipo (Equipo, Acumulado, Inicio, Oportunidades)
 * ni aparecen en las tablas de vendedores. Si la consulta falla, no excluye a
 * nadie: mejor un número con pruebas que una pantalla rota.
 */
export async function getTestUserIds(storeId: string): Promise<Set<string>> {
  const hit = testCache.get(storeId)
  if (hit && Date.now() - hit.at < 60_000) return hit.ids
  const { data, error } = await getServerSupabase().from('store_members').select('user_id')
    .eq('store_id', storeId).eq('is_test', true)
  if (error) { console.error('[getTestUserIds]', error.message); return new Set() }
  const ids = new Set((data ?? []).map(r => r.user_id as string))
  if (testCache.size > 1000) testCache.clear()
  testCache.set(storeId, { at: Date.now(), ids })
  return ids
}
