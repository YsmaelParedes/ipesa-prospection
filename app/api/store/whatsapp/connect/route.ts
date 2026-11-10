import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { limitShared } from '@/lib/rateLimit'
import { jsonError, readJson, serverError } from '@/lib/validation'
import { SignupError, connectEmbedded, parseSignupInput, signupConfig, whatsappSignupOpen } from '@/lib/whatsappSignup'
import { getStoreWhatsAppRow } from '@/lib/storeWhatsApp'
import { planOf } from '@/lib/stores'

/**
 * POST /api/store/whatsapp/connect (administrador) — termina el alta de
 * WhatsApp después de la ventana de Meta (Embedded Signup). Recibe el código
 * de un solo uso y los ids que Meta mandó a la página; sin código, retoma un
 * alta que se quedó a medias. Ver lib/whatsappSignup.ts.
 */
export async function POST(req: Request) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  if (!await limitShared([{ key: `wa-signup:${ctx.storeId}`, max: 10, windowMs: 60 * 60_000 }])) {
    return jsonError('Hiciste muchos intentos. Espera unos minutos e intenta otra vez.', 429)
  }
  const input = parseSignupInput(await readJson(req))
  if (!input) return jsonError('Faltan datos de Meta. Vuelve a tocar «Conectar con WhatsApp».')
  try {
    return NextResponse.json(await connectEmbedded(ctx, input))
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status)
    return serverError('POST /api/store/whatsapp/connect', error, 'No se pudo conectar tu WhatsApp. Intenta otra vez.')
  }
}

/**
 * GET /api/store/whatsapp/connect (administrador) — lo que necesita la pantalla
 * para abrir la ventana de Meta (ids públicos de la app) y, si un alta se quedó
 * a medias, la cuenta para retomarla sin volver a pasar por Meta.
 */
export async function GET() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  try {
    const row = await getStoreWhatsAppRow(ctx.storeId)
    const pending = row?.connection_method === 'embedded' && row.access_token_enc && !row.connected_at && row.waba_id
      ? { wabaId: row.waba_id, phoneNumberId: row.phone_number_id, coexistence: row.coexistence }
      : null
    return NextResponse.json({
      open: whatsappSignupOpen(ctx.storeId) && planOf(ctx.plan).whatsapp,
      config: signupConfig(),
      pending,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serverError('GET /api/store/whatsapp/connect', error)
  }
}
