import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'

const BUCKET = 'whatsapp-media'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB — límite de Meta para imágenes en plantillas

// GET /api/whatsapp/template-image?template=promo_aplazo_pinturas
// Regresa la URL pública guardada para esa plantilla, o null si nunca se subió.
export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()

  const template = req.nextUrl.searchParams.get('template')
  if (!template) return NextResponse.json({ error: 'template es requerido' }, { status: 400 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase.storage.from(BUCKET).list('', { search: template })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const match = (data ?? []).find(f => f.name.startsWith(`${template}.`))
  if (!match) return NextResponse.json({ url: null })

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(match.name)
  return NextResponse.json({ url: pub.publicUrl })
}

// POST /api/whatsapp/template-image — sube/reemplaza la imagen de una plantilla
// de forma permanente (solo admin). Se guarda una sola vez y se reutiliza en
// todas las campañas futuras de esa plantilla.
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const form = await req.formData()
  const file     = form.get('file') as File | null
  const template = form.get('template') as string | null

  if (!template || !/^[a-z0-9_]+$/.test(template)) {
    return NextResponse.json({ error: 'template inválido' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'file es requerido' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'La imagen excede 5MB' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Limpia versiones previas con otra extensión para no acumular archivos huérfanos
  const { data: existing } = await supabase.storage.from(BUCKET).list('', { search: template })
  const stale = (existing ?? []).filter(f => f.name.startsWith(`${template}.`)).map(f => f.name)
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale)

  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${template}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: pub.publicUrl })
}
