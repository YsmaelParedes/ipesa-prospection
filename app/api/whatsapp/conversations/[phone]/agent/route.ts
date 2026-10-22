import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { releaseToAgent } from '@/lib/whatsapp'
import { WHATSAPP_NOT_CONNECTED, getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { normalizePhone, toWhatsAppNumber } from '@/lib/phone'
import { jsonError } from '@/lib/validation'

type Ctx = { params: Promise<{ phone: string }> }

// POST /api/whatsapp/conversations/[phone]/agent — el agente de IA vuelve a atender este chat
export async function POST(_req: Request, { params }: Ctx) {
  const ctx = await requireStore({ module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  const raw = decodeURIComponent((await params).phone)
  const phone = /^\+?\d{10,15}$/.test(raw) ? normalizePhone(raw) : ''
  if (!/^\d{10}$/.test(phone)) return jsonError('Número inválido')

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds) return jsonError(WHATSAPP_NOT_CONNECTED, 409)

  const result = await releaseToAgent(creds, toWhatsAppNumber(phone))
  if (!result.ok) return NextResponse.json({ error: `Meta no devolvió el chat al agente: ${result.error}` }, { status: 502 })
  return NextResponse.json({ ok: true })
}
