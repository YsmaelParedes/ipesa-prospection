import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { EMAIL_RE, createInvitation, invitationStatus } from '@/lib/invitations'
import { logPlatformEvent } from '@/lib/platformEvents'
import { STORE_PROFILE_SCHEMA, createStore } from '@/lib/storeServer'
import { RETENTION_IDLE_DAYS } from '@/lib/retention'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

type OwnerInvite = { email: string; expires_at: string; status: string }

// GET /api/platform/stores — todas las tiendas con su dueño, uso, suscripción, eliminación por inactividad
// y, si aún no tienen dueño, su invitación de dueño pendiente (solo plataforma)
async function GETImpl() {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const db = getServerSupabase()
  const [overview, prices, invites, retention] = await Promise.all([
    db.rpc('platform_store_overview'),
    db.from('stores').select('id, modules, whatsapp_requested_at, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id, retention_hold'),
    db.from('store_invitations').select('store_id, email, expires_at, accepted_at, revoked_at')
      .eq('role', 'owner').is('accepted_at', null).is('revoked_at', null).order('created_at', { ascending: false }),
    db.rpc('store_retention_status', { p_idle_days: RETENTION_IDLE_DAYS }),
  ])
  const error = overview.error ?? prices.error ?? invites.error ?? retention.error
  if (error) return serverError('GET /api/platform/stores', error, 'No se pudieron cargar las tiendas')
  const extraOf = new Map((prices.data ?? []).map(p => [p.id as string, {
    modules: p.modules ?? null,
    whatsapp_requested_at: p.whatsapp_requested_at ?? null,
    subscription_status: p.subscription_status ?? null,
    current_period_end: p.current_period_end ?? null,
    cancel_at_period_end: !!p.cancel_at_period_end,
    stripe_customer_id: p.stripe_customer_id ?? null,
    retention_hold: !!p.retention_hold,
  }]))
  const retentionOf = new Map((retention.data ?? []).map((r: any) => [r.id as string, {
    last_used_at: r.last_used_at as string,
    retention_idle: !!r.idle,
    retention_protected: !!r.protected,
    deletion_scheduled_for: (r.deletion_scheduled_for as string | null) ?? null,
  }]))
  const inviteOf = new Map<string, OwnerInvite>()
  for (const i of invites.data ?? []) {
    if (!inviteOf.has(i.store_id)) inviteOf.set(i.store_id, { email: i.email, expires_at: i.expires_at, status: invitationStatus(i) })
  }
  const stores = (overview.data ?? []).map((st: { id: string; owner_email: string | null }) => ({
    ...st,
    ...(extraOf.get(st.id) ?? { modules: null, whatsapp_requested_at: null, subscription_status: null, current_period_end: null, cancel_at_period_end: false, stripe_customer_id: null, retention_hold: false }),
    ...(retentionOf.get(st.id) ?? { last_used_at: null, retention_idle: false, retention_protected: true, deletion_scheduled_for: null }),
    owner_invite: st.owner_email ? null : inviteOf.get(st.id) ?? null,
  }))
  return NextResponse.json({ stores }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST /api/platform/stores — alta de una tienda desde el panel del dueño.
 * { name, city?, state?, phone?, ownerEmail }
 * Para casos especiales (las tiendas se registran solas en /registro): nace en
 * Litro y se genera el enlace de invitación para su dueño (vence en 7 días).
 */
export async function POST(req: NextRequest) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, STORE_PROFILE_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (String(parsed.data.name).trim().length < 3) return jsonError('El nombre de la tienda es muy corto')
  const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(ownerEmail) || ownerEmail.length > 254) return jsonError('Escribe el correo del dueño')

  let storeId: string | null = null
  try {
    const store = await createStore(user.id, parsed.data)
    storeId = store.id
    const { invitation, link } = await createInvitation({
      storeId: store.id, email: ownerEmail, role: 'owner', invitedBy: user.id, origin: req.nextUrl.origin, replaceRole: true,
    })
    await logPlatformEvent(store.id, user.id, 'store_created', { owner_email: ownerEmail })
    return NextResponse.json({
      store: { id: store.id, name: store.name, slug: store.slug },
      invitation: { email: ownerEmail, expiresAt: invitation.expires_at },
      link,
    }, { status: 201 })
  } catch (error) {
    // Sin invitación la tienda queda huérfana: se deshace el alta
    if (storeId) await getServerSupabase().from('stores').delete().eq('id', storeId)
    return serverError('POST /api/platform/stores', error, 'No se pudo crear la tienda')
  }
}

export const GET = withServerTiming(GETImpl)
