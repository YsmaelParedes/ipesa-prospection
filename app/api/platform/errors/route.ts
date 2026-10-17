import { NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { reportErrorNow } from '@/lib/errorReport'
import { serverError } from '@/lib/validation'

const DAYS = 14

/**
 * Errores de producción (solo el dueño de la plataforma).
 * GET: los de los últimos 14 días con el nombre de la tienda, si se sabe.
 * POST: manda un error de PRUEBA para comprobar que el aviso llega al celular
 * (cada prueba cuenta como un error distinto; aplica el tope de avisos).
 */
export async function GET() {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  try {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await getServerSupabase().from('platform_errors')
      .select('id, source, context, message, count, first_seen_at, last_seen_at, resolved_at, store_id, stores(name)')
      .gte('last_seen_at', since)
      .order('last_seen_at', { ascending: false })
      .limit(60)
    if (error) throw error
    const errors = (data ?? []).map(({ stores, ...e }: any) => ({ ...e, store_name: stores?.name ?? null }))
    return NextResponse.json({ errors }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serverError('GET /api/platform/errors', error, 'No se pudieron cargar los errores')
  }
}

export async function POST() {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  // Letras al azar (los números se ignoran al comparar errores) para que cada prueba avise
  const tag = Math.random().toString(36).replace(/[0-9.]/g, '').slice(0, 8) || 'x'
  const result = await reportErrorNow({
    source: 'test',
    context: `prueba ${tag}`,
    error: new Error('Aviso de prueba: si lo ves en el celular, los avisos funcionan.'),
    storeId: null,
  })
  return NextResponse.json({ ok: result.stored, notified: result.notified, devices: result.devices })
}
