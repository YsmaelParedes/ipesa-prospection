import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireAdmin, requireUser } from '@/lib/supabase-server'
import { jsonError, serverError } from '@/lib/validation'

const BUCKET   = 'whatsapp-media'
const MAX_SIZE = 5 * 1024 * 1024 // límite de Meta para imágenes en plantillas
const TEMPLATE_RE = /^[a-z0-9_]{1,512}$/

// Meta solo acepta JPEG y PNG en encabezados de plantilla. El tipo se valida
// por los bytes reales del archivo (el `type` del navegador es falsificable).
function detectImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpeg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  return null
}

// GET /api/whatsapp/template-image?template=nombre — URL pública guardada (o null)
export async function GET(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const template = req.nextUrl.searchParams.get('template') ?? ''
  if (!TEMPLATE_RE.test(template)) return jsonError('template inválido')

  const supabase = getServerSupabase()
  const { data, error } = await supabase.storage.from(BUCKET).list('', { search: template })
  if (error) return serverError('GET /api/whatsapp/template-image', error, 'Error al consultar la imagen')

  const match = (data ?? []).find(f => f.name.startsWith(`${template}.`))
  if (!match) return NextResponse.json({ url: null })
  // ?v= evita que el navegador muestre la versión anterior tras reemplazarla
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(match.name)
  const version = match.updated_at ? `?v=${Date.parse(match.updated_at)}` : ''
  return NextResponse.json({ url: `${pub.publicUrl}${version}` })
}

// POST /api/whatsapp/template-image — sube/reemplaza la imagen de una plantilla (solo admin)
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  let form: FormData
  try { form = await req.formData() } catch { return jsonError('Formulario inválido') }
  const file     = form.get('file')
  const template = form.get('template')

  if (typeof template !== 'string' || !TEMPLATE_RE.test(template)) return jsonError('template inválido')
  if (!(file instanceof File)) return jsonError('file es requerido')
  if (file.size > MAX_SIZE) return jsonError('La imagen excede 5 MB')

  const buffer = Buffer.from(await file.arrayBuffer())
  const kind = detectImage(buffer)
  if (!kind) return jsonError('La imagen debe ser JPG o PNG (los formatos que acepta WhatsApp)')

  try {
    const supabase = getServerSupabase()
    // Limpia versiones previas con otra extensión para no acumular archivos huérfanos
    const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: template })
    const stale = (existing ?? []).filter(f => f.name.startsWith(`${template}.`)).map(f => f.name)
    if (stale.length) await supabase.storage.from(BUCKET).remove(stale)

    const path = `${template}.${kind.ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: kind.mime, upsert: true })
    if (error) throw error

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: `${pub.publicUrl}?v=${Date.now()}` })
  } catch (error) {
    return serverError('POST /api/whatsapp/template-image', error, 'Error al subir la imagen')
  }
}
