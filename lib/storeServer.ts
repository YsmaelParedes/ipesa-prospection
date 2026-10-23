/**
 * Alta y datos públicos de tiendas (solo servidor).
 */
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { ACTIVE_STORE_COOKIE, STORE_COLUMNS, getServerSupabase, type StoreContext, type StoreRow } from './supabase-server'
import { randomToken } from './crypto'
import {
  DEFAULT_CANALES, DEFAULT_MODULES, DEFAULT_PLAN, DEFAULT_SEGMENTS,
  effectiveModules, effectivePlan, normalizeModules, planOf, slugify, storeAccess,
} from './stores'
import type { Schema } from './validation'

/** Perfil editable de la tienda (lista blanca + validación). */
export const STORE_PROFILE_SCHEMA: Schema = {
  name:    { type: 'text', max: 80, required: true, label: 'Nombre de la tienda' },
  phone:   { type: 'text', max: 20, nullable: true, label: 'Teléfono', pattern: /^[\d\s()+-]*$/ },
  email:   { type: 'text', max: 254, nullable: true, label: 'Correo', pattern: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  address: { type: 'text', max: 300, nullable: true, label: 'Dirección' },
  city:    { type: 'text', max: 80, nullable: true, label: 'Ciudad' },
  state:   { type: 'text', max: 80, nullable: true, label: 'Estado' },
}

export function storeLogoUrl(path: string | null): string | null {
  if (!path) return null
  // Logos incluidos en la app (public/logos/), como el de la tienda original
  if (/^\/logos\/[\w.-]+\.(png|jpe?g|webp)$/.test(path)) return path
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/store-assets/${path}`
}

/** Lo que el navegador necesita saber de la tienda activa (sin datos internos ni ids de Stripe). */
export function publicStore(store: StoreRow) {
  const plan = effectivePlan(store)
  const def = planOf(plan)
  return {
    id: store.id,
    slug: store.slug,
    name: store.name,
    phone: store.phone,
    email: store.email,
    address: store.address,
    city: store.city,
    state: store.state,
    logoUrl: storeLogoUrl(store.logo_path),
    status: store.status,
    plan,
    planLabel: def.label,
    maxUsers: def.maxUsers,
    allowAdmins: def.allowAdmins,
    limits: { contacts: def.maxContacts },
    salesTeam: def.salesTeam,
    planIncludesWhatsApp: def.whatsapp,
    /** Suscripción de Stripe: estado, próximo cobro y si se cancela al final del periodo */
    subscription: store.stripe_subscription_id ? {
      status: store.subscription_status,
      currentPeriodEnd: store.current_period_end,
      cancelAtPeriodEnd: !!store.cancel_at_period_end,
    } : null,
    /** Tiene cliente en Stripe (puede abrir el portal: facturas, tarjeta) */
    billingPortal: !!store.stripe_customer_id,
    paidUntil: store.paid_until,
    access: storeAccess(store),
    modules: effectiveModules(store),
    onboardingCompleted: !!store.onboarding_completed_at,
    whatsappRequestedAt: store.whatsapp_requested_at ?? null,
  }
}

export function sessionPayload(ctx: StoreContext) {
  return {
    store: publicStore(ctx.store),
    role: ctx.role,
    isAdmin: ctx.isAdmin,
    litroBlocked: ctx.litroBlocked,
    stores: ctx.memberships.map(m => ({ id: m.storeId, name: m.store.name, role: m.role, logoUrl: storeLogoUrl(m.store.logo_path) })),
  }
}

export async function setActiveStoreCookie(storeId: string) {
  ;(await cookies()).set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * Crea una tienda en el plan Litro (gratis) con sus catálogos iniciales y el
 * registro de WhatsApp (sin conectar). Quien la crea queda como su primer
 * administrador; si no se puede darlo de alta, la tienda se deshace. El slug se
 * desambigua si ya existe.
 */
export async function createStore(createdBy: string, profile: Record<string, unknown>): Promise<StoreRow> {
  const db = getServerSupabase()
  const base = slugify(String(profile.name)) || 'tienda'
  let store: StoreRow | null = null
  for (let attempt = 0; attempt < 6 && !store; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || attempt}`
    const { data, error } = await db.from('stores').insert({
      ...profile,
      slug: slug.length >= 3 ? slug : `${slug}-tienda`,
      status: 'active',
      plan: DEFAULT_PLAN,
      modules: DEFAULT_MODULES,
      created_by: createdBy,
    }).select(STORE_COLUMNS).single()
    if (!error) store = data as unknown as StoreRow
    else if (error.code !== '23505') throw error
  }
  if (!store) throw new Error('No se pudo generar un identificador único para la tienda')

  const { error: memberError } = await db.from('store_members').insert({ store_id: store.id, user_id: createdBy, role: 'admin', status: 'active' })
  if (memberError) {
    await db.from('stores').delete().eq('id', store.id)
    throw memberError
  }

  const catalogs = [
    ...DEFAULT_SEGMENTS.map(label => ({ store_id: store!.id, type: 'segment', label })),
    ...DEFAULT_CANALES.map(label => ({ store_id: store!.id, type: 'canal', label })),
  ]
  const { error: catalogError } = await db.from('app_config').insert(catalogs)
  if (catalogError) console.error('[createStore] catálogos', catalogError.message)  // no bloquea el alta

  const { error: waError } = await db.from('store_whatsapp').insert({
    store_id: store.id,
    credentials_source: 'store',
    verify_token: randomToken(24),
    webhook_key: randomToken(18),
  })
  if (waError) console.error('[createStore] whatsapp', waError.message)

  return { ...store, modules: normalizeModules(store.modules) }
}
