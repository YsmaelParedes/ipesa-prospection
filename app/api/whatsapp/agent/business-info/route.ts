import { NextRequest, NextResponse } from 'next/server'
import { agentFetch } from '@/lib/metaAgent'
import { requireAgent } from '@/lib/agentRoute'
import { businessInfoPayload, toBusinessInfo } from '@/lib/agentKnowledge'
import { jsonError, readJson } from '@/lib/validation'

// PUT /api/whatsapp/agent/business-info — guarda la información de la tienda (reemplaza toda)
export async function PUT(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const input = await readJson(req)
  if (!input) return jsonError('Cuerpo inválido')
  const body = businessInfoPayload(input)
  if (typeof body === 'string') return jsonError(body)

  const res = await agentFetch(auth.creds, 'agent_config/business_info', { method: 'PUT', body: JSON.stringify(body) })
  if (!res.ok) return jsonError(res.error, 502)
  return NextResponse.json({ businessInfo: toBusinessInfo(res.data ?? body) })
}
