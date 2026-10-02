import { NextResponse } from 'next/server'
import { getServerSupabase, requirePlatformAdmin } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

// GET /api/platform/stores — todas las tiendas con su dueño y uso (solo plataforma)
export async function GET() {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user
  const { data, error } = await getServerSupabase().rpc('platform_store_overview')
  if (error) return serverError('GET /api/platform/stores', error, 'No se pudieron cargar las tiendas')
  return NextResponse.json({ stores: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
