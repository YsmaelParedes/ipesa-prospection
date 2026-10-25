import { NextRequest, NextResponse } from 'next/server'
import { agentFetch } from '@/lib/metaAgent'
import { agentItemId, requireAgent } from '@/lib/agentRoute'
import { listOf, toWebsite, websiteUrl } from '@/lib/agentKnowledge'
import { jsonError, readJson } from '@/lib/validation'

// GET /api/whatsapp/agent/websites — páginas web y cómo va su lectura (para refrescar el estado)
export async function GET() {
  const auth = await requireAgent()
  if (auth instanceof Response) return auth
  const res = await agentFetch(auth.creds, 'agent_config/websites')
  if (!res.ok) return jsonError(res.error, 502)
  return NextResponse.json({ websites: listOf(res.data, toWebsite) }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/whatsapp/agent/websites — { url } Meta empieza a leer la página
export async function POST(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const input = await readJson(req)
  const url = websiteUrl(input?.url)
  if (!url) return jsonError('Escribe la dirección de tu página, por ejemplo tutienda.mx')

  const res = await agentFetch(auth.creds, 'agent_config/websites', { method: 'POST', body: JSON.stringify({ url }) })
  const website = res.ok ? toWebsite(res.data) : null
  if (!website) return jsonError(res.ok ? 'Meta no regresó la página guardada' : res.error, 502)
  return NextResponse.json({ website })
}

// DELETE /api/whatsapp/agent/websites?id=…
export async function DELETE(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const id = agentItemId(req)
  if (!id) return jsonError('Página no válida')
  const res = await agentFetch(auth.creds, `agent_config/websites/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return jsonError(res.error, 502)
  return NextResponse.json({ ok: true })
}
