import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'
import { hasSalesTeam, salesTeamRequired } from '@/lib/commercialServer'

const MAX_IDS = 500

/**
 * POST /api/data/commercial/assign — reparte contactos (solo dueño o administrador).
 *   { ids, owner: uuid | null }  → todos a esa persona (null = "Sin asignar")
 *   { ids, split: uuid[] }       → en partes iguales, en el orden de ids
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, write: true })
  if (ctx instanceof Response) return ctx
  if (!hasSalesTeam(ctx)) return salesTeamRequired()

  const body = await readJson(req)
  const ids = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every(isUUID)) {
    return jsonError(`Elige de 1 a ${MAX_IDS} contactos`)
  }
  const unique = Array.from(new Set(ids as string[]))

  const split = body?.split
  const single = body?.owner
  let targets: (string | null)[]
  if (Array.isArray(split)) {
    if (!split.length || !split.every(isUUID)) return jsonError('Elige a quién repartir')
    targets = Array.from(new Set(split as string[]))
  } else if (single === null || isUUID(single)) {
    targets = [single]
  } else {
    return jsonError('Elige a quién asignar')
  }

  // Solo a miembros activos de esta tienda (consulta directa, sin caché)
  const supabase = getServerSupabase()
  const { data: members, error: membersError } = await supabase.from('store_members').select('user_id')
    .eq('store_id', ctx.storeId).eq('status', 'active')
  if (membersError) return serverError('POST /api/data/commercial/assign', membersError, 'No se pudieron asignar los contactos')
  const active = new Set((members ?? []).map(m => m.user_id as string))
  if (targets.some(t => t !== null && !active.has(t))) return jsonError('Esa persona no está activa en el equipo')

  const groups = new Map<string | null, string[]>()
  unique.forEach((id, i) => {
    const t = targets[i % targets.length]
    groups.set(t, [...(groups.get(t) ?? []), id])
  })

  try {
    let updated = 0
    for (const [owner, list] of groups) {
      const { data, error } = await supabase.from('contacts').update({ owner_id: owner })
        .eq('store_id', ctx.storeId).in('id', list).select('id')
      if (error) throw error
      updated += data?.length ?? 0
    }
    return NextResponse.json({ updated })
  } catch (error) {
    return serverError('POST /api/data/commercial/assign', error, 'No se pudieron asignar los contactos')
  }
}
