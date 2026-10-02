import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

// GET /api/whatsapp/quick-replies — respuestas rápidas del equipo de la tienda
export async function GET() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const { data, error } = await getServerSupabase()
    .from('whatsapp_quick_replies')
    .select('id, title, body')
    .eq('store_id', ctx.storeId)
    .order('title', { ascending: true })
  if (error) return serverError('GET /api/whatsapp/quick-replies', error, 'Error al obtener respuestas rápidas')
  return NextResponse.json({ items: data ?? [] })
}

// POST /api/whatsapp/quick-replies — { title, body } (dueño/admin)
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, {
    title: { type: 'text', max: 60, required: true, label: 'Título' },
    body:  { type: 'text', max: 1000, required: true, label: 'Mensaje' },
  })
  if (!parsed.ok) return jsonError(parsed.error)

  const { data, error } = await getServerSupabase()
    .from('whatsapp_quick_replies')
    .insert([{ ...parsed.data, created_by: ctx.uid, store_id: ctx.storeId }])
    .select('id, title, body')
  if (error) return serverError('POST /api/whatsapp/quick-replies', error, 'Error al guardar la respuesta rápida')
  return NextResponse.json(data?.[0] ?? {})
}
