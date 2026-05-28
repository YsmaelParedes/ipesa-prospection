import { NextResponse } from 'next/server'
import { getServerSupabase, getUserId, unauthorizedResponse } from '@/lib/supabase-server'

export async function GET() {
  try {
    const uid = await getUserId()
    if (!uid) return unauthorizedResponse()

    const supabase = getServerSupabase()

    const now          = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    const [
      { count: totalContacts },
      { data: leadsData,    error: leadsError },
      { data: contactsData },
    ] = await Promise.all([
      // Contactos: global (compartido entre usuarios)
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      // Leads: solo del usuario actual (+ legacy sin user_id)
      supabase
        .from('leads')
        .select('*')
        .or(`user_id.eq.${uid},user_id.is.null`)
        .order('created_at', { ascending: false }),
      // Contactos por segmento: global
      supabase.from('contacts').select('segment, acquisition_channel'),
    ])

    if (leadsError) throw leadsError

    const leads    = leadsData    || []
    const contacts = contactsData || []

    // ── Métricas del usuario ────────────────────────────────────────────────
    const activeStates  = ['Nuevo', 'En seguimiento', 'Cotizado']
    const leadsActivos  = leads.filter(l => activeStates.includes(l.estado)).length
    const cierresMes    = leads.filter(l => l.estado === 'Cerrado' && l.created_at >= startOfMonth).length
    const conversion    = leads.length > 0
      ? Math.round((leads.filter(l => l.estado === 'Cerrado').length / leads.length) * 100)
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
      ...todayLeads.filter(l => l.estado === 'Cerrado').map(l => ({
        type: 'close', who: l.name, what: 'cerró como cliente', time: 'hoy', color: '#3D8B5C',
      })),
      ...todayLeads.filter(l => l.estado !== 'Cerrado').map(l => ({
        type: 'lead', who: l.name, what: `nuevo lead · ${l.canal}`, time: 'hoy', color: '#EE5A24',
      })),
    ].slice(0, 8)

    return NextResponse.json({
      metrics: { totalContacts: totalContacts || 0, leadsActivos, cierresMes, conversion },
      byChannel,
      bySegment,
      recentLeads,
      activity,
    })
  } catch (error: any) {
    console.error('[GET /api/data/dashboard]', error?.message ?? error)
    return NextResponse.json({ error: 'Error al obtener métricas' }, { status: 500 })
  }
}
