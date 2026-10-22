import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { agentFetch, settingsPayload, toSettings } from '@/lib/metaAgent'
import { normalizePhone } from '@/lib/phone'
import { withContactNames } from '@/lib/agentTestNumbers'
import { jsonError, readJson } from '@/lib/validation'

/**
 * GET /api/whatsapp/agent (dueño/admin) — estado del agente de IA de Meta:
 *  · state "ready": ajustes + números de prueba
 *  · state "inactive": el número aún no tiene agente (se puede activar)
 *  · state "not_eligible": Meta dice que este número no puede usarlo
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx
  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const res = await agentFetch(creds, 'agent_config/settings')
  if (!res.ok && res.status !== 404) return jsonError(res.error, 502)
  const settings = res.ok ? toSettings(res.data) : null
  if (!settings) {
    const eligibility = await agentFetch<{ is_eligible?: boolean }>(creds, 'agent_eligibility')
    const state = eligibility.ok && eligibility.data?.is_eligible === false ? 'not_eligible' : 'inactive'
    return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const allowlist = await agentFetch<any[]>(creds, 'agent_config/allowlist')
  const entries = allowlist.ok && Array.isArray(allowlist.data)
    ? allowlist.data
      .filter(e => typeof e?.id === 'string' && e.consumer_phone_number)
      .map(e => ({ id: e.id as string, phone: normalizePhone(String(e.consumer_phone_number)) }))
    : []
  return NextResponse.json({
    state: 'ready',
    settings,
    testNumbers: await withContactNames(ctx.storeId, entries),
    testNumbersError: allowlist.ok ? null : allowlist.error,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// PUT /api/whatsapp/agent — cambia los ajustes (solo lo que venga en el cuerpo)
export async function PUT(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx
  const input = await readJson(req)
  if (!input) return jsonError('Cuerpo inválido')
  const body = settingsPayload(input)
  if (typeof body === 'string') return jsonError(body)

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const agentId = typeof input.agentId === 'string' && /^\w{1,64}$/.test(input.agentId) ? input.agentId : null
  const res = await agentFetch(creds, `agent_config/settings${agentId ? `?agent_id=${agentId}` : ''}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) return jsonError(res.error, 502)
  return NextResponse.json({ settings: toSettings(res.data) })
}

export const GET = withServerTiming(GETImpl)
