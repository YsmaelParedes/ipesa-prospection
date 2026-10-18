import { NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

/**
 * GET /api/billing/usage — cuánto usa la tienda de lo que incluye su plan
 * (Configuración → Plan): contactos, leads y usuarios activos. Dueño/admin.
 */
export async function GET() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  try {
    const db = getServerSupabase()
    const count = (table: string, filter?: (q: any) => any) => {
      let q = db.from(table).select('*', { count: 'exact', head: true }).eq('store_id', ctx.storeId)
      if (filter) q = filter(q)
      return q
    }
    const [contacts, leads, members] = await Promise.all([
      count('contacts'),
      count('leads'),
      count('store_members', q => q.eq('status', 'active')),
    ])
    const error = contacts.error ?? leads.error ?? members.error
    if (error) throw error
    return NextResponse.json(
      { contacts: contacts.count ?? 0, leads: leads.count ?? 0, members: members.count ?? 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return serverError('GET /api/billing/usage', error, 'No se pudo cargar el uso del plan')
  }
}
