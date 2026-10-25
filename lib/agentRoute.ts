import type { NextRequest } from 'next/server'
import { requireStore, type StoreContext } from './supabase-server'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from './storeWhatsApp'
import { jsonError } from './validation'
import type { WhatsAppCreds } from './whatsapp'

/** Rutas del agente de IA: solo administradores, con WhatsApp activo y conectado. */
export async function requireAgent(write = false): Promise<{ ctx: StoreContext; creds: WhatsAppCreds } | Response> {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', ...(write ? { write: true } : {}) })
  if (ctx instanceof Response) return ctx
  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)
  return { ctx, creds }
}

/** ?id= de un recurso de Meta (se pasa tal cual en la ruta), o null si no es válido. */
export function agentItemId(req: NextRequest): string | null {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  return /^[\w.:-]{1,128}$/.test(id) ? id : null
}

/** ?agentId= de los ajustes (las reglas van por agente). */
export function agentIdParam(value: unknown): string | null {
  return typeof value === 'string' && /^\w{1,64}$/.test(value) ? value : null
}
