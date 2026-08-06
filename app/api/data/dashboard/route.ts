import { NextResponse } from 'next/server'
import { getServerSupabase, getUserContext, unauthorizedResponse } from '@/lib/supabase-server'

export async function GET() {
  try {
    const ctx = await getUserContext()
    if (!ctx) return unauthorizedResponse()
    const { uid, role } = ctx

    const supabase = getServerSupabase()

    const now          = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    // Admin: leads de todos los usuarios (supervisión). Empleado: solo los suyos (+ legacy).
    const leadsQuery = role === 'admin'
      ? supabase.from('leads').select('*').order('created_at', { ascending: false })
      : supabase.from('leads').select('*').or(`user_id.eq.${uid},user_id.is.null`).order('created_at', { ascending: false })

    const [
      { count: totalContacts },
      { data: leadsData,    error: leadsError },
      { data: contactsData },
      usersResult,
    ] = await Promise.all([
      // Contactos: global (compartido entre usuarios)
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      leadsQuery,
      // Contactos por segmento: global
      supabase.from('contacts').select('segment, acquisition_channel'),
      role === 'admin' ? supabase.auth.admin.listUsers({ perPage: 200 }) : Promise.resolve(null),
    ])

    if (leadsError) throw leadsError

    const leads    = leadsData    || []
    const contacts = contactsData || []

    // ── Desglose por vendedor (solo admin) ──────────────────────────────────
    let byOwner: { name: string; count: number }[] = []
    if (role === 'admin' && usersResult) {
      const nameByUid = new Map(
        (usersResult.data?.users ?? []).map(u => [u.id, (u.user_metadata?.display_name as string)?.trim() || u.email || 'Usuario'])
      )
      const ownerCounts: Record<string, number> = {}
      for (const l of leads) {
        const name = l.user_id ? (nameByUid.get(l.user_id) ?? 'Usuario') : 'Sin asignar'
        ownerCounts[name] = (ownerCounts[name] || 0) + 1
      }
      byOwner = Object.entries(ownerCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    }

    // ── Métricas del usuario ────────────────────────────────────────────────
    const activeStates  = ['Nuevo', 'En seguimiento', 'Cotizado']
    const leadsActivos  = leads.filter(l => activeStates.includes(l.estado)).length
    const cierresMes    = leads.filter(l => l.estado === 'Ganado / Venta realizada' && l.created_at >= startOfMonth).length
    const conversion    = leads.length > 0
      ? Math.round((leads.filter(l => l.estado === 'Ganado / Venta realizada').length / leads.length) * 100)
      : 0

    // ── Canal breakdown (últimos 30 días, leads del usuario) ─────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const recentLeadsAll = leads.filter(l => l.created_at >= thirtyDaysAgo)
    const channelCounts: Record<string, number> = {}
    for (const l of recentLeadsAll) {
      const ch = l.canal || 'Otro'
      channelCounts[ch] = (channelCounts[ch] || 0) + 1
    }
    const byChannel = Object.entries(channelCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    // ── Segmento breakdown (contactos globales) ───────────────────────────────
    const segmentCounts: Record<string, number> = {}
    for (const c of contacts) {
      if (c.segment) segmentCounts[c.segment] = (segmentCounts[c.segment] || 0) + 1
    }
    const bySegment = Object.entries(segmentCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    // ── Leads recientes del usuario ───────────────────────────────────────────
    const recentLeads = leads.slice(0, 6).map(l => ({
      id:     l.id,
      name:   l.name,
      canal:  l.canal,
      estado: l.estado,
      fecha:  l.fecha || l.created_at?.slice(0, 10),
    }))

    // ── Feed de actividad de hoy ──────────────────────────────────────────────
    const todayLeads = leads.filter(l => l.created_at >= startOfToday)
    const activity = [
      ...todayLeads.filter(l => l.estado === 'Ganado / Venta realizada').map(l => ({
        type: 'close', who: l.name, what: 'cerró como cliente', time: 'hoy', color: '#3D8B5C',
      })),
      ...todayLeads.filter(l => l.estado !== 'Ganado / Venta realizada').map(l => ({
        type: 'lead', who: l.name, what: `nuevo lead · ${l.canal}`, time: 'hoy', color: '#EE5A24',
      })),
    ].slice(0, 8)

    return NextResponse.json({
      metrics: { totalContacts: totalContacts || 0, leadsActivos, cierresMes, conversion },
      byChannel,
      bySegment,
      byOwner,
      recentLeads,
      activity,
      isAdmin: role === 'admin',
    })
  } catch (error: any) {
    console.error('[GET /api/data/dashboard]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener métricas' }, { status: 500 })
  }
}
