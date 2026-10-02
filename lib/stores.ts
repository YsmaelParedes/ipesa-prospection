/**
 * Reglas de la plataforma multi-tienda compartidas por cliente y servidor
 * (sin dependencias de Node): estados, prueba gratis, módulos y catálogos
 * iniciales de cada tienda nueva.
 */

export const TRIAL_DAYS = 14
/** Días de gracia después de vencer el pago antes de pasar a solo lectura. */
export const PAYMENT_GRACE_DAYS = 3
const DAY = 24 * 60 * 60 * 1000

export type StoreStatus = 'trial' | 'active' | 'suspended' | 'cancelled'
export type StoreRole = 'owner' | 'admin' | 'employee'
export type StoreAccess = 'full' | 'readonly'

export const STORE_MODULES = ['whatsapp', 'campaigns', 'formulas'] as const
export type StoreModule = typeof STORE_MODULES[number]
export type StoreModules = Record<StoreModule, boolean>
export const DEFAULT_MODULES: StoreModules = { whatsapp: true, campaigns: true, formulas: true }

export const MODULE_INFO: Record<StoreModule, { label: string; description: string }> = {
  whatsapp:  { label: 'WhatsApp',  description: 'Bandeja de conversaciones ligada a contactos y leads.' },
  campaigns: { label: 'Campañas',  description: 'Envío de plantillas aprobadas a varios contactos con reglas anti-bloqueo.' },
  formulas:  { label: 'Fórmulas',  description: 'Igualación de colores Vinipesa con cantidades en mL.' },
}

export const STATUS_LABELS: Record<StoreStatus, string> = {
  trial: 'Prueba gratis', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada',
}

export const ROLE_LABELS: Record<StoreRole, string> = {
  owner: 'Dueño', admin: 'Administrador', employee: 'Vendedor',
}

/** Planes de referencia (el cobro por ahora es manual desde el panel de la plataforma). */
export const PLANS: Record<string, { label: string; maxUsers: number }> = {
  profesional: { label: 'Profesional', maxUsers: 15 },
}
export const DEFAULT_PLAN = 'profesional'
export const planOf = (plan: string) => PLANS[plan] ?? PLANS[DEFAULT_PLAN]

export const DEFAULT_SEGMENTS = ['Hogar', 'Constructor', 'Arquitecto', 'Pintor', 'Empresa']
export const DEFAULT_CANALES = ['WhatsApp', 'Visita en tienda', 'Recomendación', 'Facebook', 'Instagram', 'Google', 'Otro']

type AccessFields = { status: StoreStatus | string; trial_ends_at: string | null; paid_until: string | null }

/**
 * Qué puede hacer una tienda: 'full' o 'readonly' (prueba vencida, pago
 * vencido, suspendida o cancelada). En solo lectura el equipo puede consultar
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

/** "IPESA Cholula Centro" → "ipesa-cholula-centro" */
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
