import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

// GET /api/whatsapp/unread — conversaciones con mensajes sin leer (badge del menú)
async function GETImpl() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  if (!ctx.modules.whatsapp) return NextResponse.json({ unread: 0 }, { headers: { 'Cache-Control': 'no-store' } })

  const { count, error } = await getServerSupabase()
    .from('whatsapp_threads')
    .select('phone', { count: 'exact', head: true })
    .eq('store_id', ctx.storeId)
    .gt('unread', 0)
  if (error) return serverError('GET /api/whatsapp/unread', error, 'Error al consultar no leídos')
  return NextResponse.json({ unread: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = withServerTiming(GETImpl)
