import { NextRequest, NextResponse } from 'next/server'
import { agentFetch } from '@/lib/metaAgent'
import { agentItemId, requireAgent } from '@/lib/agentRoute'
import { FILE_EXTENSIONS, MAX_FILE_BYTES, fileExtension, toKnowledgeFile } from '@/lib/agentKnowledge'
import { jsonError } from '@/lib/validation'

/**
 * POST /api/whatsapp/agent/files (multipart: file) — sube un archivo a lo que
 * consulta la IA (lista de precios, fichas técnicas…). Se reenvía a Meta tal
 * cual; aquí no se guarda nada.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  if (Number(req.headers.get('content-length') || 0) > MAX_FILE_BYTES + 64 * 1024) return jsonError('El archivo pesa más de 4 MB', 413)

  let file: File | null = null
  try {
    const form = await req.formData()
    const value = form.get('file')
    file = value instanceof File ? value : null
  } catch { /* cuerpo inválido */ }
  if (!file || !file.size) return jsonError('Elige un archivo')
  if (file.size > MAX_FILE_BYTES) return jsonError('El archivo pesa más de 4 MB')
  const name = file.name.replace(/[\\/]/g, '_').slice(0, 200)
  if (!(FILE_EXTENSIONS as readonly string[]).includes(fileExtension(name))) return jsonError('Sube un PDF, Word (.doc o .docx) o una imagen (.png o .jpg)')

  const body = new FormData()
  body.append('file_name', name)
  body.append('file', file, name)
  const res = await agentFetch(auth.creds, 'agent_config/files', { method: 'POST', body })
  const saved = res.ok ? toKnowledgeFile(res.data) : null
  if (!saved) return jsonError(res.ok ? 'Meta no regresó el archivo guardado' : res.error, 502)
  return NextResponse.json({ file: saved })
}

// DELETE /api/whatsapp/agent/files?id=…
export async function DELETE(req: NextRequest) {
  const auth = await requireAgent(true)
  if (auth instanceof Response) return auth
  const id = agentItemId(req)
  if (!id) return jsonError('Archivo no válido')
  const res = await agentFetch(auth.creds, `agent_config/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) return jsonError(res.error, 502)
  return NextResponse.json({ ok: true })
}
