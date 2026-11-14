import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { audienceOf, loadAudience } from '@/lib/campaignAudience'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

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

/**
 * POST /api/whatsapp/campaigns/audience { contactIds } (solo admin) — los
 * contactos elegidos a mano (desde Contactos) con la misma regla; `block`
 * incluye 'no_phone' para los que no tienen un celular válido.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  const ids = body?.contactIds
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5000 || !ids.every(isUUID)) return jsonError('contactIds debe tener de 1 a 5000 contactos')
  try {
    return NextResponse.json({ contacts: await audienceOf(ctx.storeId, ids) })
  } catch (error) {
    return serverError('POST /api/whatsapp/campaigns/audience', error, 'Error al revisar los destinatarios')
  }
}

export const GET = withServerTiming(GETImpl)
