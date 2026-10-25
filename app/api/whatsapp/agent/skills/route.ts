import { NextRequest, NextResponse } from 'next/server'
import { agentFetch } from '@/lib/metaAgent'
import { agentIdParam, agentItemId, requireAgent } from '@/lib/agentRoute'
import { skillPayload, toSkill } from '@/lib/agentKnowledge'
import { jsonError, readJson } from '@/lib/validation'

/**
 * Reglas del agente (en Meta, "skills"): cuándo aplica y qué debe hacer la IA.
 * Meta revisa cada regla antes de usarla: queda "En revisión" unos minutos y
 * puede rechazarla (casi siempre por pedir datos personales sensibles).
 */

// POST /api/whatsapp/agent/skills — { name, description, skill, agentId? }
export async function POST(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const input = (await readJson(req)) ?? {}
  const body = skillPayload(input)
  if (typeof body === 'string') return jsonError(body)

  const agentId = agentIdParam(input.agentId)
  const res = await agentFetch(auth.creds, `agent_config/skills${agentId ? `?agent_id=${agentId}` : ''}`, { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok && res.status === 409) return jsonError('Ya tienes una regla con ese nombre. Usa otro.', 409)
  const skill = res.ok ? toSkill(res.data) : null
  if (!skill) return jsonError(res.ok ? 'Meta no regresó la regla guardada' : res.error, 502)
  return NextResponse.json({ skill })
}

// PUT /api/whatsapp/agent/skills?id=… — edita una regla (Meta la vuelve a revisar)
export async function PUT(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const id = agentItemId(req)
  if (!id) return jsonError('Regla no válida')
  const body = skillPayload((await readJson(req)) ?? {})
  if (typeof body === 'string') return jsonError(body)

  const res = await agentFetch(auth.creds, `agent_config/skills/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok && res.status === 409) return jsonError('Ya tienes una regla con ese nombre. Usa otro.', 409)
  const skill = res.ok ? toSkill(res.data) : null
  if (!skill) return jsonError(res.ok ? 'Meta no regresó la regla guardada' : res.error, 502)
  return NextResponse.json({ skill })
}

// DELETE /api/whatsapp/agent/skills?id=…
export async function DELETE(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const id = agentItemId(req)
  if (!id) return jsonError('Regla no válida')
  const res = await agentFetch(auth.creds, `agent_config/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return jsonError(res.error, 502)
  return NextResponse.json({ ok: true })
}
