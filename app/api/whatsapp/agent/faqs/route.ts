import { NextRequest, NextResponse } from 'next/server'
import { agentFetch } from '@/lib/metaAgent'
import { agentItemId, requireAgent } from '@/lib/agentRoute'
import { faqPayload, toFaq } from '@/lib/agentKnowledge'
import { jsonError, readJson } from '@/lib/validation'

// POST /api/whatsapp/agent/faqs — { question, answer } agrega una pregunta frecuente
export async function POST(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const body = faqPayload((await readJson(req)) ?? {})
  if (typeof body === 'string') return jsonError(body)

  const res = await agentFetch(auth.creds, 'agent_config/faq', { method: 'POST', body: JSON.stringify(body) })
  const faq = res.ok ? toFaq(res.data) : null
  if (!faq) return jsonError(res.ok ? 'Meta no regresó la pregunta guardada' : res.error, 502)
  return NextResponse.json({ faq })
}

// PUT /api/whatsapp/agent/faqs?id=… — edita una pregunta (Meta puede cambiarle el id)
export async function PUT(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const id = agentItemId(req)
  if (!id) return jsonError('Pregunta no válida')
  const body = faqPayload((await readJson(req)) ?? {})
  if (typeof body === 'string') return jsonError(body)

  const res = await agentFetch(auth.creds, `agent_config/faq/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
  const faq = res.ok ? toFaq(res.data) : null
  if (!faq) return jsonError(res.ok ? 'Meta no regresó la pregunta guardada' : res.error, 502)
  return NextResponse.json({ faq })
}

// DELETE /api/whatsapp/agent/faqs?id=…
export async function DELETE(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const id = agentItemId(req)
  if (!id) return jsonError('Pregunta no válida')
  const res = await agentFetch(auth.creds, `agent_config/faq/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return jsonError(res.error, 502)
  return NextResponse.json({ ok: true })
}
