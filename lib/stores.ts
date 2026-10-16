/**
 * Reglas de la plataforma multi-tienda compartidas por cliente y servidor
 * (sin dependencias de Node): estados, prueba gratis, módulos y catálogos
 * iniciales de cada tienda nueva.
 */

export const TRIAL_DAYS = 14
/** Días de gracia después de vencer el pago antes de pasar a solo lectura. */
export const PAYMENT_GRACE_DAYS = 3
const DAY = 24 * 60 * 60 * 1000

/** pending = "Por activar": tienda nueva (ya no hay prueba gratis) hasta su primer pago o cortesía. */
export type StoreStatus = 'pending' | 'trial' | 'active' | 'suspended' | 'cancelled'
export type StoreRole = 'owner' | 'admin' | 'employee'
export type StoreAccess = 'full' | 'readonly'

export const STORE_MODULES = ['whatsapp', 'campaigns', 'formulas'] as const
export type StoreModule = typeof STORE_MODULES[number]
export type StoreModules = Record<StoreModule, boolean>
/**
 * Módulos de una tienda nueva. WhatsApp y Campañas son exclusivos de la tienda
 * original (IPESA, que los tiene guardados como encendidos): no se ofrecen a
 * tiendas nuevas y nadie los enciende desde la app. Ya no hay interruptores.
 */
export const DEFAULT_MODULES: StoreModules = { whatsapp: false, campaigns: false, formulas: true }

export const STATUS_LABELS: Record<StoreStatus, string> = {
  pending: 'Por activar', trial: 'Prueba gratis', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada',
}

export const ROLE_LABELS: Record<StoreRole, string> = {
  owner: 'Dueño', admin: 'Administrador', employee: 'Vendedor',
}

/**
 * Planes (el precio se acuerda con cada tienda y se cobra a mano desde el panel).
 *  · maxUsers: usuarios activos de la tienda, contando al dueño.
 *  · allowAdmins: si el dueño puede nombrar administradores. Sin ellos, el dueño
 *    es el único que configura la tienda y ve los leads de todos; cada vendedor
 *    ve solo los suyos (los contactos son de toda la tienda).
 * Profesional = dueño + 2 vendedores. Interno = la tienda propia (IPESA), sin
 * límite práctico; lo asigna el dueño de la plataforma desde la ficha.
 */
export const PLANS: Record<string, { label: string; maxUsers: number; allowAdmins: boolean }> = {
  profesional: { label: 'Profesional', maxUsers: 3, allowAdmins: false },
  interno:     { label: 'Interno', maxUsers: 50, allowAdmins: true },
}
export const DEFAULT_PLAN = 'profesional'
export const planOf = (plan: string) => PLANS[plan] ?? PLANS[DEFAULT_PLAN]

export const DEFAULT_SEGMENTS = ['Hogar', 'Constructor', 'Arquitecto', 'Pintor', 'Empresa']
export const DEFAULT_CANALES = ['WhatsApp', 'Visita en tienda', 'Recomendación', 'Facebook', 'Instagram', 'Google', 'Otro']

type AccessFields = { status: StoreStatus | string; trial_ends_at: string | null; paid_until: string | null }

/**
 * Qué puede hacer una tienda: 'full' o 'readonly' (por activar, prueba
 * vencida, pago vencido, suspendida o cancelada). En solo lectura el equipo puede consultar
 * y exportar su información, pero no registrar ni enviar nada.
 */
export function storeAccess(s: AccessFields, now = Date.now()): StoreAccess {
  if (s.status === 'active') {
    return !s.paid_until || new Date(s.paid_until).getTime() + PAYMENT_GRACE_DAYS * DAY > now ? 'full' : 'readonly'
  }
  if (s.status === 'trial') {
    return s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now ? 'full' : 'readonly'
  }
  return 'readonly'
}

/** Días que le quedan a la prueba (redondeado hacia arriba); null si no está en prueba. */
export function trialDaysLeft(s: AccessFields, now = Date.now()): number | null {
  if (s.status !== 'trial' || !s.trial_ends_at) return null
  return Math.max(0, Math.ceil((new Date(s.trial_ends_at).getTime() - now) / DAY))
}

export function trialEndsAt(from = Date.now()): string {
  return new Date(from + TRIAL_DAYS * DAY).toISOString()
}

/** "Pinturas La Paleta" → "pinturas-la-paleta" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '')
}

export function normalizeModules(value: unknown): StoreModules {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<StoreModule, unknown>>
  return Object.fromEntries(STORE_MODULES.map(m => [m, v[m] === undefined ? DEFAULT_MODULES[m] : v[m] === true])) as StoreModules
}

export const isStoreAdminRole = (role: StoreRole) => role === 'owner' || role === 'admin'
