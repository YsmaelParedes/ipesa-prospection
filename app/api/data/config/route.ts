import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

// Allowed config types — whitelist prevents arbitrary table queries
const ALLOWED_CONFIG_TYPES = ['estado', 'canal', 'segment', 'segmento', 'fuente', 'etapa'] as const

export async function GET(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()
    const type = req.nextUrl.searchParams.get('type')

    // Validate type param against whitelist to prevent injection
    if (type && !ALLOWED_CONFIG_TYPES.includes(type as typeof ALLOWED_CONFIG_TYPES[number])) {
      return NextResponse.json({ error: 'Tipo de configuración no válido' }, { status: 400 })
    }

    let q = supabase.from('app_config').select('*').order('label', { ascending: true })
    if (type) q = q.eq('type', type)
    const { data, error } = await q
    if (error) throw error
    // NO cachear en CDN — la config es editable por el usuario y debe verse inmediatamente.
    return NextResponse.json({ items: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener config' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const body = await req.json()

    if (!body.type || typeof body.type !== 'string') {
      return NextResponse.json({ error: 'type es requerido' }, { status: 400 })
    }
    if (!ALLOWED_CONFIG_TYPES.includes(body.type as typeof ALLOWED_CONFIG_TYPES[number])) {
      return NextResponse.json({ error: 'Tipo de configuración no válido' }, { status: 400 })
    }
    if (!body.label || typeof body.label !== 'string' || body.label.trim().length === 0) {
      return NextResponse.json({ error: 'label es requerido' }, { status: 400 })
    }
    if (body.label.length > 100) {
      return NextResponse.json({ error: 'label excede 100 caracteres' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('app_config')
      .insert([{ type: body.type, label: body.label.trim() }])
      .select()
    if (error) throw error
    return NextResponse.json(data?.[0] ?? {})
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al crear item' }, { status: 500 })
  }
}
