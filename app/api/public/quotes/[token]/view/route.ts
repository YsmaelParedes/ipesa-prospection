import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { serverError } from '@/lib/validation'
import { isShareToken } from '@/lib/quotesServer'

type Ctx = { params: Promise<{ token: string }> }

/**
 * POST /api/public/quotes/[token]/view — la primera vez que el cliente abre
 * su cotización. Lo manda la página con JavaScript (las vistas previas de
 * enlaces de WhatsApp o del correo no lo ejecutan) y no se manda cuando la
 * abre alguien de la tienda.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!rateLimit(`quote-view:${clientIp(req)}`, 30, 60_000)) return NextResponse.json({ ok: false }, { status: 429 })
  const { token } = await params
  if (!isShareToken(token)) return NextResponse.json({ ok: false }, { status: 404 })
  try {
    const { error } = await getServerSupabase().from('quotes').update({ viewed_at: new Date().toISOString() })
      .eq('share_token', token).is('viewed_at', null).neq('status', 'draft')
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('POST /api/public/quotes/[token]/view', error, 'No se pudo registrar')
  }
}
