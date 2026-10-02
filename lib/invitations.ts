/**
 * Invitaciones al equipo de una tienda (solo servidor). El enlace lleva un
 * token aleatorio de 256 bits; en la base solo queda su hash SHA-256.
 */
import { getServerSupabase } from './supabase-server'
import { hashToken } from './crypto'

export const INVITATION_DAYS = 7
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type InvitationRow = {
  id: string; store_id: string; email: string; role: 'admin' | 'employee'
  expires_at: string; accepted_at: string | null; revoked_at: string | null; created_at: string
}

export type InvitationStatus = 'valid' | 'expired' | 'used' | 'revoked'

export function invitationStatus(inv: Pick<InvitationRow, 'expires_at' | 'accepted_at' | 'revoked_at'>): InvitationStatus {
  if (inv.revoked_at) return 'revoked'
  if (inv.accepted_at) return 'used'
  if (new Date(inv.expires_at).getTime() <= Date.now()) return 'expired'
  return 'valid'
}

export async function findInvitationByToken(token: string): Promise<InvitationRow | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null
  const { data } = await getServerSupabase().from('store_invitations')
    .select('id, store_id, email, role, expires_at, accepted_at, revoked_at, created_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  return (data as InvitationRow | null) ?? null
}

/** "karen.lopez@hotmail.com" → "ka•••••••@hotmail.com" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return email
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(3, user.length - 2))}@${domain}`
}

/** URL pública del sitio para armar enlaces (o el origen de la petición). */
export function siteOrigin(reqOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  return configured || reqOrigin
}

/** Reglas mínimas de contraseña (Supabase puede exigir más). */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Escribe una contraseña'
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
  if (password.length > 72) return 'La contraseña es demasiado larga'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Usa letras y números en tu contraseña'
  return null
}
