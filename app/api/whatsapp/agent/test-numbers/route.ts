import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { MAX_TEST_NUMBERS, agentFetch, toE164 } from '@/lib/metaAgent'
import { normalizePhone } from '@/lib/phone'
import { jsonError, readJson } from '@/lib/validation'
import { withContactNames } from '@/lib/agentTestNumbers'

// POST /api/whatsapp/agent/test-numbers — { phone } agrega un número de prueba
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx
  const input = await readJson(req)
  const phone = normalizePhone(typeof input?.phone === 'string' ? input.phone : '')
  if (!/^\d{10}$/.test(phone)) return jsonError('Escribe un celular de 10 dígitos')

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const current = await agentFetch<any[]>(creds, 'agent_config/allowlist')
  if (current.ok && Array.isArray(current.data)) {
    if (current.data.some(e => normalizePhone(String(e?.consumer_phone_number ?? '')) === phone)) return jsonError('Ese número ya está en la lista')
    if (current.data.length >= MAX_TEST_NUMBERS) return jsonError(`Meta permite hasta ${MAX_TEST_NUMBERS} números de prueba`)
  }

  const res = await agentFetch<{ id?: string }>(creds, 'agent_config/allowlist', {
    method: 'POST',
    body: JSON.stringify({ consumer_phone_number: toE164(phone) }),
  })
  if (!res.ok || typeof res.data?.id !== 'string') return jsonError(res.ok ? 'Meta no regresó el número agregado' : res.error, 502)
  const [entry] = await withContactNames(ctx.storeId, [{ id: res.data.id, phone }])
  return NextResponse.json({ entry })
}

// DELETE /api/whatsapp/agent/test-numbers?id=… — quita un número de prueba
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!/^[\w.:-]{1,128}$/.test(id)) return jsonError('Número no válido')

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const res = await agentFetch(creds, `agent_config/allowlist/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return jsonError(res.error, 502)
  return NextResponse.json({ ok: true })
}
