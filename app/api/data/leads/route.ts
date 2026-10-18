import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, getUserNameMap, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, parseFields, readJson, serverError } from '@/lib/validation'
import { LEAD_SCHEMA, contactInStore, ownLeadsFilter } from '@/lib/leads'
import { normalizePhone } from '@/lib/phone'
import { fetchPaged } from '@/lib/paged'
import { parsePlanLimitError, planLimitResponse } from '@/lib/planLimits'

// GET /api/data/leads[?contact_id=uuid]
// Vendedor: solo sus leads (+ legacy sin user_id). Dueño/admin: todos los de la
// tienda, con el nombre del vendedor.
async function GETImpl(req: NextRequest) {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  const contactId = req.nextUrl.searchParams.get('contact_id')
  if (contactId && !isUUID(contactId)) return jsonError('contact_id inválido')
  const phone = normalizePhone(req.nextUrl.searchParams.get('phone'))

  try {
    // Consulta nueva por página (todas las páginas, no solo las primeras 1000 filas)
    const page = (from: number, to: number) => {
      let q = getServerSupabase().from('leads').select('*').eq('store_id', ctx.storeId)
      if (contactId) {
        // Leads del contacto: por vínculo o, para los heredados sin vínculo, por teléfono
        q = /^\d{10}$/.test(phone) ? q.or(`contact_id.eq.${contactId},phone.eq.${phone}`) : q.eq('contact_id', contactId)
      } else if (!ctx.isAdmin) {
        q = q.or(ownLeadsFilter(ctx.uid))
      }
      return q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)
    }

    const [data, names, pending] = await Promise.all([
      fetchPaged<any>(page, 100000),
      ctx.isAdmin ? getUserNameMap(ctx.storeId).catch(() => new Map<string, string>()) : Promise.resolve(null),
      // Próximo seguimiento programado de cada lead (de cualquier persona del equipo)
      fetchPaged<{ lead_id: string; reminder_date: string }>((from, to) => getServerSupabase().from('reminders').select('lead_id, reminder_date')
        .eq('store_id', ctx.storeId).eq('completado', false).not('lead_id', 'is', null)
        .order('reminder_date', { ascending: true }).order('id', { ascending: true }).range(from, to), 100000),
    ])

    const nextByLead = new Map<string, string>()
    for (const r of pending ?? []) {
      const prev = nextByLead.get(r.lead_id)
      if (!prev || r.reminder_date < prev) nextByLead.set(r.lead_id, r.reminder_date)
    }

    const visible = (data ?? []).filter(l => ctx.isAdmin || !l.user_id || l.user_id === ctx.uid)
    const leads = visible.map(l => ({
      ...l,
      next_reminder_at: nextByLead.get(l.id) ?? null,
      ...(names ? { owner_name: l.user_id ? (names.get(l.user_id) ?? 'Usuario') : 'Sin asignar' } : {}),
    }))
    return NextResponse.json({ leads })
  } catch (error) {
    return serverError('GET /api/data/leads', error, 'Error al obtener leads')
  }
}

// POST /api/data/leads — crea lead vinculado al usuario autenticado
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, LEAD_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (typeof parsed.data.phone === 'string') parsed.data.phone = normalizePhone(parsed.data.phone)
  if (parsed.data.contact_id && !(await contactInStore(ctx.storeId, parsed.data.contact_id as string))) {
    return jsonError('Contacto no encontrado', 404)
  }

  const { data, error } = await getServerSupabase()
    .from('leads')
    .insert([{ ...parsed.data, user_id: ctx.uid, store_id: ctx.storeId }])
    .select()
  if (error) {
    // Plan Litro: la base rechaza el lead que pasa del límite
    const hit = parsePlanLimitError(error)
    if (hit) return planLimitResponse(hit.kind, hit.limit)
    return serverError('POST /api/data/leads', error, 'Error al crear lead')
  }
  return NextResponse.json(data)
}

export const GET = withServerTiming(GETImpl)
