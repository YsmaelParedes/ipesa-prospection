import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { agentFetch } from '@/lib/metaAgent'
import { jsonError } from '@/lib/validation'

/**
 * POST /api/whatsapp/agent/activate (administrador) — crea el agente de IA del
 * número y lo deja contestando solo a números de prueba. Meta lo crea con el
 * público "todos" (con costo), así que se cambia de inmediato.
 */
export async function POST() {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx
  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const onboarding = await agentFetch<{ agent_id?: string }>(creds, 'agent_onboarding', { method: 'POST', body: '{}' })
  if (!onboarding.ok) return jsonError(onboarding.error, 502)

  const agentId = onboarding.data?.agent_id
  const settings = await agentFetch(creds, `agent_config/settings${agentId ? `?agent_id=${encodeURIComponent(agentId)}` : ''}`, {
    method: 'PUT',
    body: JSON.stringify({ ai_audience: 'ALLOWLISTED_ONLY', rollout: { enabled: true } }),
  })
  if (!settings.ok) {
    return jsonError(`El agente se creó, pero no se pudo dejar en modo de prueba: ${settings.error}. Revísalo en Ajustes antes de usarlo.`, 502)
  }
  return NextResponse.json({ ok: true })
}
