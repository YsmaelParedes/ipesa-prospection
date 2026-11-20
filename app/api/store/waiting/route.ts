import { NextResponse } from 'next/server'
import { getMainAdmin, getStoreMembers, requireStore } from '@/lib/supabase-server'
import { serverError } from '@/lib/validation'

/**
 * GET /api/store/waiting — en Litro, quiénes del equipo quedaron en espera
 * (todos los activos menos el administrador principal, que es el único que
 * entra). Solo para el administrador; en otros planes la lista va vacía.
 * Inicio lo usa para ofrecer Cubeta: «3 personas de tu equipo no pueden entrar».
 */
export async function GET() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  if (ctx.plan !== 'litro') return NextResponse.json({ waiting: [] })
  try {
    const [members, main] = await Promise.all([getStoreMembers(ctx.storeId), getMainAdmin(ctx.storeId)])
    const waiting = members
      .filter(m => m.status === 'active' && m.user_id !== main)
      .map(m => ({ name: m.display_name || m.email }))
    return NextResponse.json({ waiting }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serverError('GET /api/store/waiting', error, 'Error al consultar tu equipo')
  }
}
