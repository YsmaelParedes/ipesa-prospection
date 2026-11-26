import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { TEMPLATE_IMAGE_MAX, TEMPLATE_NAME_RE, detectImage, findTemplateImage, publicImageUrl, saveTemplateImage } from '@/lib/templateImage'
import { jsonError, serverError } from '@/lib/validation'

// GET /api/whatsapp/template-image?template=nombre — URL pública guardada (o null)
async function GETImpl(req: NextRequest) {
  const ctx = await requireStore({ module: 'whatsapp' })
  if (ctx instanceof Response) return ctx

  const template = req.nextUrl.searchParams.get('template') ?? ''
  if (!TEMPLATE_NAME_RE.test(template)) return jsonError('template inválido')

  let match: Awaited<ReturnType<typeof findTemplateImage>>
  try { match = await findTemplateImage(ctx.storeId, template) } catch (error) {
    return serverError('GET /api/whatsapp/template-image', error, 'Error al consultar la imagen')
  }
  if (!match) return NextResponse.json({ url: null })
  // ?v= evita que el navegador muestre la versión anterior tras reemplazarla
  return NextResponse.json({ url: publicImageUrl(match.path, match.updatedAt ? Date.parse(match.updatedAt) : null) })
}

// POST /api/whatsapp/template-image — sube/reemplaza la imagen de una plantilla (administrador)
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  let form: FormData
  try { form = await req.formData() } catch { return jsonError('Formulario inválido') }
  const file     = form.get('file')
  const template = form.get('template')

  if (typeof template !== 'string' || !TEMPLATE_NAME_RE.test(template)) return jsonError('template inválido')
  if (!(file instanceof File)) return jsonError('file es requerido')
  if (file.size > TEMPLATE_IMAGE_MAX) return jsonError('La imagen excede 5 MB')

  const buffer = Buffer.from(await file.arrayBuffer())
  const kind = detectImage(buffer)
  if (!kind) return jsonError('La imagen debe ser JPG o PNG (los formatos que acepta WhatsApp)')

  try {
    return NextResponse.json({ url: await saveTemplateImage(ctx.storeId, template, buffer, kind) })
  } catch (error) {
    return serverError('POST /api/whatsapp/template-image', error, 'Error al subir la imagen')
  }
}

export const GET = withServerTiming(GETImpl)
