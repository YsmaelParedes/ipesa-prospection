import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { getServerSupabase, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'
import { fetchPaged } from '@/lib/paged'
import { COMMERCIAL_COLUMNS, hasSalesTeam } from '@/lib/commercialServer'
import { todayISO } from '@/lib/commercial'

/**
 * GET /api/data/commercial — contactos para el sistema comercial.
 * Vendedor: solo los suyos. Dueño/administrador: todos los de la tienda, con
 * el nombre del responsable y el equipo activo (para filtrar y repartir).
 */
async function GETImpl() {
  const ctx = await requireStore()
  if (ctx instanceof Response) return ctx

  try {
    const page = (from: number, to: number) => {
      let q = getServerSupabase().from('contacts').select(COMMERCIAL_COLUMNS).eq('store_id', ctx.storeId)
      if (!ctx.isAdmin) q = q.eq('owner_id', ctx.uid)
      return q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
    }
    const [contacts, members] = await Promise.all([
      fetchPaged<Record<string, unknown>>(page, 100000),
      ctx.isAdmin ? getStoreMembers(ctx.storeId).catch(() => []) : Promise.resolve([]),
    ])

    const active = members.filter(m => m.status === 'active')
    const names = new Map(members.map(m => [m.user_id, m.display_name]))
    return NextResponse.json({
      today: todayISO(ctx.store.timezone),
      uid: ctx.uid,
      salesTeam: hasSalesTeam(ctx),
      team: active.map(m => ({ user_id: m.user_id, name: m.display_name, role: m.role })),
      contacts: ctx.isAdmin
        ? contacts.map(c => ({ ...c, owner_name: c.owner_id ? (names.get(c.owner_id as string) ?? 'Usuario') : null }))
        : contacts,
    })
  } catch (error) {
    return serverError('GET /api/data/commercial', error, 'Error al obtener el sistema comercial')
  }
}

export const GET = withServerTiming(GETImpl)
