import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { planOf } from '@/lib/stores'
import { serverError } from '@/lib/validation'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/whatsapp/unread — conversaciones con mensajes sin leer (badge del menú).
 * En Litro, si la tienda conectó su número (en la prueba de Cubeta), los
 * mensajes siguen llegando: al administrador se le dice cuántos chats esperan
 * (`locked: true`), sin quién escribió ni qué dice, para ofrecerle Cubeta.
 */
async function GETImpl() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const db = getServerSupabase()
  let locked = false
  if (!ctx.modules.whatsapp) {
    if (planOf(ctx.plan).whatsapp || !ctx.isAdmin) return NextResponse.json({ unread: 0 }, { headers: NO_STORE })
    const { data: wa, error } = await db.from('store_whatsapp').select('store_id')
      .eq('store_id', ctx.storeId).eq('connection_method', 'embedded').not('access_token_enc', 'is', null).maybeSingle()
    if (error) return serverError('GET /api/whatsapp/unread', error, 'Error al consultar no leídos')
    if (!wa) return NextResponse.json({ unread: 0 }, { headers: NO_STORE })
    locked = true
  }

  const { count, error } = await db
    .from('whatsapp_threads')
    .select('phone', { count: 'exact', head: true })
    .eq('store_id', ctx.storeId)
    .gt('unread', 0)
  if (error) return serverError('GET /api/whatsapp/unread', error, 'Error al consultar no leídos')
  return NextResponse.json(locked ? { unread: count ?? 0, locked } : { unread: count ?? 0 }, { headers: NO_STORE })
}

export const GET = withServerTiming(GETImpl)
