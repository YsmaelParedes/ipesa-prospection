import { NextRequest, NextResponse } from 'next/server'
import { getUserContext, unauthorizedResponse } from '@/lib/supabase-server'
import { uploadWhatsAppMedia } from '@/lib/whatsapp'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB — límite de Meta para imágenes en plantillas

// POST /api/whatsapp/media — sube una imagen a Meta, regresa el media id
// para usarse como encabezado de plantilla en una campaña (solo admin)
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'file es requerido' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'La imagen excede 5MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadWhatsAppMedia(buffer, file.type, file.name || 'imagen.jpg')

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ mediaId: result.mediaId })
}
