import { NextResponse } from 'next/server'
import { getServerSupabase, requireUser } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

// GET /api/whatsapp/unread — conversaciones con mensajes sin leer (badge del menú)
export async function GET() {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const { count, error } = await getServerSupabase()
    .from('whatsapp_conversations')
    .select('phone', { count: 'exact', head: true })
    .gt('unread', 0)
  if (error) return serverError('GET /api/whatsapp/unread', error, 'Error al consultar no leídos')
  return NextResponse.json({ unread: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
