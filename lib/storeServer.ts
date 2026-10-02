/**
 * Alta y datos públicos de tiendas (solo servidor).
 */
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { ACTIVE_STORE_COOKIE, STORE_COLUMNS, getServerSupabase, invalidateMemberships, type StoreContext, type StoreRow } from './supabase-server'
import { randomToken } from './crypto'
import {
  DEFAULT_CANALES, DEFAULT_MODULES, DEFAULT_PLAN, DEFAULT_SEGMENTS,
  normalizeModules, planOf, slugify, storeAccess, trialDaysLeft, trialEndsAt,
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

/** Lo que el navegador necesita saber de la tienda activa (sin datos internos). */
export function publicStore(store: StoreRow) {
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
    plan: store.plan,
    planLabel: planOf(store.plan).label,
    maxUsers: planOf(store.plan).maxUsers,
    trialEndsAt: store.trial_ends_at,
    trialDaysLeft: trialDaysLeft(store),
    paidUntil: store.paid_until,
    access: storeAccess(store),
    modules: normalizeModules(store.modules),
    onboardingCompleted: !!store.onboarding_completed_at,
  }
}

export function sessionPayload(ctx: StoreContext) {
  return {
    store: publicStore(ctx.store),
    role: ctx.role,
    isAdmin: ctx.isAdmin,
    isOwner: ctx.isOwner,
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
 * Crea una tienda en periodo de prueba con su dueño, catálogos iniciales y
 * el registro de WhatsApp (sin conectar). El slug se desambigua si ya existe.
 */
export async function provisionStore(user: User, profile: Record<string, unknown>): Promise<StoreRow> {
  const db = getServerSupabase()
  const base = slugify(String(profile.name)) || 'tienda'
  let store: StoreRow | null = null
  for (let attempt = 0; attempt < 6 && !store; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || attempt}`
    const { data, error } = await db.from('stores').insert({
      ...profile,
      slug: slug.length >= 3 ? slug : `${slug}-tienda`,
      status: 'trial',
      plan: DEFAULT_PLAN,
      trial_ends_at: trialEndsAt(),
      modules: DEFAULT_MODULES,
      created_by: user.id,
    }).select(STORE_COLUMNS).single()
    if (!error) store = data as unknown as StoreRow
    else if (error.code !== '23505') throw error
  }
  if (!store) throw new Error('No se pudo generar un identificador único para la tienda')

  const rollback = async (cause: unknown) => {
    await db.from('stores').delete().eq('id', store!.id)
    throw cause
  }
  const { error: memberError } = await db.from('store_members').insert({ store_id: store.id, user_id: user.id, role: 'owner' })
  if (memberError) await rollback(memberError)

  const catalogs = [
    ...DEFAULT_SEGMENTS.map(label => ({ store_id: store!.id, type: 'segment', label })),
    ...DEFAULT_CANALES.map(label => ({ store_id: store!.id, type: 'canal', label })),
  ]
  const { error: catalogError } = await db.from('app_config').insert(catalogs)
  if (catalogError) console.error('[provisionStore] catálogos', catalogError.message)  // no bloquea el alta

  const { error: waError } = await db.from('store_whatsapp').insert({
    store_id: store.id,
    credentials_source: 'store',
    verify_token: randomToken(24),
    webhook_key: randomToken(18),
  })
  if (waError) console.error('[provisionStore] whatsapp', waError.message)

  invalidateMemberships(user.id)
  return store
}
