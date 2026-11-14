import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { loadAudience } from '@/lib/campaignAudience'
import { serverError } from '@/lib/validation'

/**
 * GET /api/whatsapp/campaigns/audience (solo admin) — para elegir destinatarios:
 * todos los contactos con celular, con su historial de campañas, si se les
 * puede mandar (`block`) y si Meta pidió esperar antes de reenviarles marketing
 * (`hold`). Los resultados de cada campaña están en /api/whatsapp/campaigns/history.
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  try {
    return NextResponse.json({ contacts: await loadAudience(ctx.storeId) })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/audience', error, 'Error al obtener los destinatarios')
  }
}

export const GET = withServerTiming(GETImpl)
