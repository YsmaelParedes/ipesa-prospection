import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/errorReport'
import { clientIp, rateLimit } from '@/lib/rateLimit'
import { readJson } from '@/lib/validation'

/**
 * POST /api/client-errors { message, page, kind } — errores del navegador.
 * Sin sesión a propósito (también fallan la pantalla de entrada y la de
 * recuperar contraseña). Siempre responde 200: quien reporta no debe enterarse
 * de nada ni reintentar. Acotado por IP y por tamaño; la función de la base
 * limita además cuántos tipos nuevos de error se aceptan por hora.
 */
export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ ok: true })
  if (!rateLimit(`client-error:${clientIp(req)}`, 10, 60_000)) return ok
  const body = await readJson(req)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const page = typeof body?.page === 'string' && body.page.startsWith('/') ? body.page.split('?')[0].slice(0, 120) : ''
  if (!message || message.length > 500) return ok
  reportError({
    source: body?.kind === 'render' ? 'render' : 'client',
    context: `navegador ${page || '/'}`,
    error: new Error(message),
  })
  return ok
}
