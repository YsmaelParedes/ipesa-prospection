import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { jsonError, readJson, serverError } from '@/lib/validation'

/** PATCH /api/platform/errors/[id] { resolved: boolean } — marcar un error como resuelto (solo el dueño de la plataforma). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const { id } = await params
  if (!/^\d{1,18}$/.test(id)) return jsonError('Error no encontrado', 404)
  const body = await readJson(req)
  if (typeof body?.resolved !== 'boolean') return jsonError('Valor inválido')
  try {
    const { data, error } = await getServerSupabase().from('platform_errors')
      .update({ resolved_at: body.resolved ? new Date().toISOString() : null })
      .eq('id', Number(id)).select('id')
    if (error) throw error
    if (!data?.length) return jsonError('Error no encontrado', 404)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverError('PATCH /api/platform/errors/[id]', error, 'No se pudo actualizar')
  }
}
