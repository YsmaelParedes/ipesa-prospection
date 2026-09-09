import { NextRequest, NextResponse } from 'next/server'
import { getUserContext, unauthorizedResponse } from '@/lib/supabase-server'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'

// POST /api/whatsapp/test-send — envía la plantilla de ejemplo "hello_world"
// (solo admin, para verificar que la integración de Meta quedó bien configurada)
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return unauthorizedResponse()
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const { to } = await req.json()
  if (!to || typeof to !== 'string' || !/^\d{10,15}$/.test(to)) {
    return NextResponse.json({ error: 'to debe ser un número en formato 52XXXXXXXXXX (solo dígitos)' }, { status: 400 })
  }

  const result = await sendWhatsAppTemplate(to, 'hello_world', 'en_US')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ success: true, messageId: result.messageId })
}
