import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { loadPeople } from '@/lib/campaignPeople'
import { PEOPLE_WINDOW_DAYS } from '@/lib/campaignKinds'
import { serverError } from '@/lib/validation'

/**
 * GET /api/whatsapp/campaigns/people (solo admin)
 * Cómo le fue a cada número con las campañas del último año: respondió, leyó,
 * no le llegó, sin WhatsApp… (Resultados → Por persona).
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'campaigns' })
  if (ctx instanceof Response) return ctx

  try {
    return NextResponse.json({ days: PEOPLE_WINDOW_DAYS, people: await loadPeople(ctx.storeId) })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/people', error, 'Error al obtener los resultados por persona')
  }
}

export const GET = withServerTiming(GETImpl)
