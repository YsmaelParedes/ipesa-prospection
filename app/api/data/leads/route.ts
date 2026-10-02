import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireUser } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { LEAD_SCHEMA, ownLeadsFilter } from '@/lib/leads'
import { normalizePhone } from '@/lib/phone'

// GET /api/data/leads[?contact_id=uuid]
// Empleado: solo sus leads (+ legacy sin user_id). Admin: todos, con el nombre del vendedor.
export async function GET(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const contactId = req.nextUrl.searchParams.get('contact_id')
  if (contactId && !isUUID(contactId)) return jsonError('contact_id inválido')
  const phone = normalizePhone(req.nextUrl.searchParams.get('phone'))

  try {
    let q = getServerSupabase().from('leads').select('*').order('created_at', { ascending: false })
    if (contactId) {
      // Leads del contacto: por vínculo o, para los heredados sin vínculo, por teléfono
      q = /^\d{10}$/.test(phone) ? q.or(`contact_id.eq.${contactId},phone.eq.${phone}`) : q.eq('contact_id', contactId)
    } else if (ctx.role !== 'admin') {
      q = q.or(ownLeadsFilter(ctx.uid))
    }

    const [{ data, error }, names] = await Promise.all([
      q,
      ctx.role === 'admin' ? getUserNameMap().catch(() => new Map<string, string>()) : Promise.resolve(null),
    ])
    if (error) throw error

    const visible = (data ?? []).filter(l => ctx.role === 'admin' || !l.user_id || l.user_id === ctx.uid)
    const leads = names
      ? visible.map(l => ({ ...l, owner_name: l.user_id ? (names.get(l.user_id) ?? 'Usuario') : 'Sin asignar' }))
      : visible
    return NextResponse.json({ leads })
  } catch (error) {
    return serverError('GET /api/data/leads', error, 'Error al obtener leads')
  }
}

// POST /api/data/leads — crea lead vinculado al usuario autenticado
export async function POST(req: NextRequest) {
  const ctx = await requireUser()
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, LEAD_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (typeof parsed.data.phone === 'string') parsed.data.phone = normalizePhone(parsed.data.phone)

  const { data, error } = await getServerSupabase()
    .from('leads')
    .insert([{ ...parsed.data, user_id: ctx.uid }])
    .select()
  if (error) return serverError('POST /api/data/leads', error, 'Error al crear lead')
  return NextResponse.json(data)
}
