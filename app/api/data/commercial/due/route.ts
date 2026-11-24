import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { storeDays } from '@/lib/storeActivity'
import { dueToday } from '@/lib/commercialServer'
import { serverError } from '@/lib/validation'

/** GET /api/data/commercial/due — cuántos pendientes tienes hoy (número de «Hoy» en el menú). Solo cuenta, no trae filas. */
async function GETImpl() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx
  const { count, error } = await dueToday(ctx, storeDays(ctx).today, 'id', true)
  if (error) return serverError('GET /api/data/commercial/due', error, 'Error al contar tus pendientes')
  return NextResponse.json({ due: count ?? 0 })
}

export const GET = withServerTiming(GETImpl)
