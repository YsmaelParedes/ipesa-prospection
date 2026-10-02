import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireAdmin, requireUser } from '@/lib/supabase-server'
import { jsonError, readJson, serverError } from '@/lib/validation'

// Tipos reales en la BD (CHECK type IN ('segment','canal'))
const CONFIG_TYPES = ['segment', 'canal'] as const
type ConfigType = typeof CONFIG_TYPES[number]
const isConfigType = (v: unknown): v is ConfigType => typeof v === 'string' && (CONFIG_TYPES as readonly string[]).includes(v)

// GET /api/data/config[?type=segment|canal] — cualquier usuario (alimenta los formularios)
export async function GET(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const type = req.nextUrl.searchParams.get('type')
  if (type && !isConfigType(type)) return jsonError('Tipo de configuración no válido')

  let q = getServerSupabase().from('app_config').select('id, type, label, created_at').order('label', { ascending: true })
  if (type) q = q.eq('type', type)
  const { data, error } = await q
  if (error) return serverError('GET /api/data/config', error, 'Error al obtener config')
  // No cachear: es editable y debe verse de inmediato.
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/data/config — solo administradores (cambia las opciones de todos)
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body || !isConfigType(body.type)) return jsonError('Tipo de configuración no válido')
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label) return jsonError('label es requerido')
  if (label.length > 100) return jsonError('label excede 100 caracteres')

  const { data, error } = await getServerSupabase().from('app_config').insert([{ type: body.type, label }]).select()
  if (error) {
    if (error.code === '23505') return jsonError(`Ya existe "${label}"`)
    return serverError('POST /api/data/config', error, 'Error al crear item')
  }
  return NextResponse.json(data?.[0] ?? {})
}
