/**
 * Reglas de la plataforma multi-tienda compartidas por cliente y servidor
 * (sin dependencias de Node): estados, planes, módulos y catálogos
 * iniciales de cada tienda nueva.
 */

/** Días de gracia de un plan de paga asignado a mano (cortesía) antes de bajar a Litro. */
export const PAYMENT_GRACE_DAYS = 3
const DAY = 24 * 60 * 60 * 1000

/**
 * pending / trial: estados de antes de los planes con Stripe (ya no se usan;
 * la base los acepta por compatibilidad). Solo suspended y cancelled dejan a
 * la tienda en solo lectura.
 */
export type StoreStatus = 'pending' | 'trial' | 'active' | 'suspended' | 'cancelled'
export type StoreRole = 'admin' | 'employee'
export type StoreAccess = 'full' | 'readonly'

export const STORE_MODULES = ['whatsapp', 'campaigns', 'formulas'] as const
export type StoreModule = typeof STORE_MODULES[number]
export type StoreModules = Record<StoreModule, boolean>
/**
 * Módulos de una tienda nueva:
 *  · whatsapp: la bandeja de chats. Viene en el plan Cubeta, pero además el
 *    asesor tiene que conectar el número y encenderla en la base.
 *  · campaigns y formulas: extras que NO se ofrecen en la plataforma (las
 *    fórmulas son de IPESA y las campañas se venden aparte). Las tiendas
 *    nuevas nacen sin ellos y solo se encienden a mano en la base
 *    (stores.modules); hoy solo los tiene la tienda IPESA.
 * Lo que la tienda puede usar es la combinación con su plan: effectiveModules().
 */
export const DEFAULT_MODULES: StoreModules = { whatsapp: false, campaigns: false, formulas: false }

export const STATUS_LABELS: Record<StoreStatus, string> = {
  pending: 'Por activar', trial: 'Prueba gratis', active: 'Activa', suspended: 'Suspendida', cancelled: 'Cancelada',
}

export const ROLE_LABELS: Record<StoreRole, string> = {
  admin: 'Administrador', employee: 'Vendedor',
}

/**
 * Planes. El precio vive en Stripe (precios con lookup_key, lib/stripe.ts);
 * aquí solo lo que incluye cada uno.
 *  · maxUsers: usuarios activos de la tienda, contando a los administradores (Litro: solo uno).
 *  · allowAdmins: si puede haber más de un administrador (sin él, solo quien abrió la tienda).
 *  · maxContacts: null = sin límite. El mismo número está en la función
 *    plan_quota() de la base, que lo hace cumplir: cambia los dos.
 *  · whatsapp: incluye la bandeja de WhatsApp (las campañas son un extra aparte).
 *  · paid: se cobra con Stripe.
 * Interno = la tienda propia (IPESA): cortesía con todo, se asigna a mano en la base.
 */
export type PlanId = 'litro' | 'galon' | 'cubeta' | 'interno'
export type PlanDef = {
  label: string; maxUsers: number; allowAdmins: boolean
  maxContacts: number | null
  whatsapp: boolean; paid: boolean
  /** Sistema comercial en equipo: Oportunidades, metas por vendedor y pantalla Equipo. */
  salesTeam: boolean
}
export const PLANS: Record<PlanId, PlanDef> = {
  litro:   { label: 'Litro',   maxUsers: 1,  allowAdmins: false, maxContacts: 50,   whatsapp: false, paid: false, salesTeam: false },
  galon:   { label: 'Galón',   maxUsers: 3,  allowAdmins: false, maxContacts: null, whatsapp: false, paid: true,  salesTeam: true },
  cubeta:  { label: 'Cubeta',  maxUsers: 5,  allowAdmins: true,  maxContacts: null, whatsapp: true,  paid: true,  salesTeam: true },
  interno: { label: 'Interno', maxUsers: 50, allowAdmins: true,  maxContacts: null, whatsapp: true,  paid: false, salesTeam: true },
}
/** Planes que se venden (en orden), sin la cortesía interna. */
export const PUBLIC_PLANS = ['litro', 'galon', 'cubeta'] as const satisfies readonly PlanId[]
export type PaidPlanId = 'galon' | 'cubeta'
export const DEFAULT_PLAN: PlanId = 'litro'
export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && Object.hasOwn(PLANS, v)
export const planOf = (plan: string) => PLANS[isPlanId(plan) ? plan : DEFAULT_PLAN]

type PlanFields = { plan: string; paid_until: string | null }

/**
 * Plan que aplica hoy. Un plan de paga asignado a mano cuyo paid_until venció
 * (más los días de gracia) cuenta como Litro. Stripe deja paid_until en null
 * mientras está al corriente; en past_due guarda el inicio de la mora para
 * limitarla a los mismos días de gracia. Gemela de la función
 * store_effective_plan() de la base: si cambias una, cambia la otra.
 */
export function effectivePlan(s: PlanFields, now = Date.now()): PlanId {
  const plan = isPlanId(s.plan) ? s.plan : DEFAULT_PLAN
  if ((plan === 'galon' || plan === 'cubeta') && s.paid_until
      && new Date(s.paid_until).getTime() + PAYMENT_GRACE_DAYS * DAY <= now) return 'litro'
  return plan
}

/**
 * Módulos que la tienda puede usar: WhatsApp si su plan lo incluye y el asesor
 * lo encendió; Campañas solo encima de WhatsApp; Fórmulas tal como estén en la base.
 */
export function effectiveModules(s: PlanFields & { modules: unknown }, now = Date.now()): StoreModules {
  const m = normalizeModules(s.modules)
  const p = PLANS[effectivePlan(s, now)]
  const whatsapp = m.whatsapp && p.whatsapp
  return { whatsapp, campaigns: whatsapp && m.campaigns, formulas: m.formulas }
}

/** Estados de Stripe con los que la suscripción sigue dando el plan pagado. */
export const PAID_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const
/** Estados de Stripe con los que la suscripción terminó (la tienda baja a Litro). */
export const ENDED_SUBSCRIPTION_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'] as const

export const DEFAULT_SEGMENTS = ['Hogar', 'Constructor', 'Arquitecto', 'Pintor', 'Empresa']
export const DEFAULT_CANALES = ['WhatsApp', 'Visita en tienda', 'Recomendación', 'Facebook', 'Instagram', 'Google', 'Otro']

/**
 * Qué puede hacer una tienda: 'full' o 'readonly'. Solo una tienda suspendida
 * o cancelada a mano en la base queda en solo lectura (puede
 * consultar y exportar, pero no registrar ni enviar nada). Dejar de pagar ya no
 * bloquea: la tienda baja al plan Litro.
 */
export function storeAccess(s: { status: StoreStatus | string }): StoreAccess {
  return s.status === 'suspended' || s.status === 'cancelled' ? 'readonly' : 'full'
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

export const isStoreAdminRole = (role: StoreRole) => role === 'admin'
