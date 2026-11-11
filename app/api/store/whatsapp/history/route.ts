import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { limitShared } from '@/lib/rateLimit'
import { jsonError, serverError } from '@/lib/validation'
import { SignupError, retryHistory } from '@/lib/whatsappSignup'

/**
 * POST /api/store/whatsapp/history (administrador) — vuelve a pedir a Meta
 * el historial de chats de un número en coexistencia, si no se pidió o falló
 * y todavía está dentro de las 24 h que Meta permite. Ver lib/whatsappSignup.ts.
 */
export async function POST() {
  const ctx = await requireStore({ admin: true, write: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx
  if (!await limitShared([{ key: `wa-history:${ctx.storeId}`, max: 5, windowMs: 60 * 60_000 }])) {
    return jsonError('Hiciste muchos intentos. Espera unos minutos e intenta otra vez.', 429)
  }
  try {
    return NextResponse.json(await retryHistory(ctx))
  } catch (error) {
    if (error instanceof SignupError) return jsonError(error.message, error.status)
    return serverError('POST /api/store/whatsapp/history', error, 'No se pudieron pedir tus chats. Intenta otra vez.')
  }
}
