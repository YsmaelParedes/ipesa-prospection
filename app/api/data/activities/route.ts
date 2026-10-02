import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError, type Schema } from '@/lib/validation'
import { ACTIVITY_TYPES, getAccessibleLead } from '@/lib/leads'

const ACTIVITY_SCHEMA: Schema = {
  lead_id:       { type: 'uuid', required: true, label: 'Lead' },
  type:          { type: 'enum', values: ACTIVITY_TYPES, required: true, label: 'Tipo' },
  description:   { type: 'text', max: 2000, nullable: true, label: 'Descripción' },
  amount:        { type: 'number', min: 0, max: 1_000_000_000, nullable: true, label: 'Monto' },
  activity_date: { type: 'datetime', label: 'Fecha' },
}

// GET /api/data/activities?lead_id=xxx — historial de un lead al que el usuario tiene acceso
export async function GET(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const leadId = req.nextUrl.searchParams.get('lead_id')
  if (!isUUID(leadId)) return jsonError('lead_id es requerido')
  if (!(await getAccessibleLead(ctx, leadId))) return jsonError('Lead no encontrado', 404)

  const { data, error } = await getServerSupabase()
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .eq('store_id', ctx.storeId)
    .order('activity_date', { ascending: false })
  if (error) return serverError('GET /api/data/activities', error, 'Error al obtener actividades')
  return NextResponse.json({ activities: data ?? [] })
}

// POST /api/data/activities
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, ACTIVITY_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (!(await getAccessibleLead(ctx, parsed.data.lead_id as string))) return jsonError('Lead no encontrado', 404)

  const { data, error } = await getServerSupabase()
    .from('lead_activities')
    .insert([{ ...parsed.data, user_id: ctx.uid, store_id: ctx.storeId }])
    .select()
  if (error) return serverError('POST /api/data/activities', error, 'Error al crear actividad')
  return NextResponse.json(data?.[0] ?? {})
}
