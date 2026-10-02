import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireAdmin } from '@/lib/supabase-server'
import { TEMPLATE_REPEAT_DAYS } from '@/lib/whatsappSafety'
import { serverError } from '@/lib/validation'

const DAY = 24 * 60 * 60 * 1000
const REPLY_WINDOW = 3 * DAY // una respuesta cuenta si llega dentro de 72 h del envío

type TemplateStats = {
  template: string
  sent: number          // aceptados por Meta (no fallidos)
  delivered: number     // entregados o leídos
  read: number
  failed: number
  replied: number       // destinatarios que escribieron dentro de 72 h
  lastSentAt: string
  topErrors: { error: string; count: number }[]
}

/**
 * GET /api/whatsapp/campaigns/stats?days=30 (solo admin)
 * Resultados por plantilla + destinatarios recientes de cada plantilla (para
 * no repetirla a la misma persona antes de TEMPLATE_REPEAT_DAYS días).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90)
  const since = new Date(Date.now() - days * DAY).toISOString()

  try {
    const supabase = getServerSupabase()
    const [{ data: sends, error }, { data: inbound, error: inError }] = await Promise.all([
      supabase.from('whatsapp_messages')
        .select('phone, template_name, status, error_message, created_at')
        .eq('direction', 'outbound').not('template_name', 'is', null)
        .gte('created_at', since).order('created_at', { ascending: true }).limit(10000),
      supabase.from('whatsapp_messages')
        .select('phone, created_at')
        .eq('direction', 'inbound').gte('created_at', since).limit(10000),
    ])
    if (error) throw error
    if (inError) throw inError

    const inboundByPhone = new Map<string, number[]>()
    for (const m of inbound ?? []) {
      const list = inboundByPhone.get(m.phone) ?? []
      list.push(new Date(m.created_at).getTime())
      inboundByPhone.set(m.phone, list)
    }

    const stats = new Map<string, TemplateStats & { repliedPhones: Set<string>; errors: Map<string, number> }>()
    const recentCutoff = Date.now() - TEMPLATE_REPEAT_DAYS * DAY
    const recentRecipients: Record<string, string[]> = {}

    for (const m of sends ?? []) {
      const t = m.template_name as string
      let s = stats.get(t)
      if (!s) {
        s = { template: t, sent: 0, delivered: 0, read: 0, failed: 0, replied: 0, lastSentAt: m.created_at, topErrors: [], repliedPhones: new Set(), errors: new Map() }
        stats.set(t, s)
      }
      s.lastSentAt = m.created_at
      if (m.status === 'failed') {
        s.failed++
        const key = m.error_message || 'Error desconocido'
        s.errors.set(key, (s.errors.get(key) ?? 0) + 1)
        continue
      }
      s.sent++
      if (m.status === 'delivered' || m.status === 'read') s.delivered++
      if (m.status === 'read') s.read++

      const sentAt = new Date(m.created_at).getTime()
      const replies = inboundByPhone.get(m.phone) ?? []
      if (replies.some(t2 => t2 > sentAt && t2 - sentAt <= REPLY_WINDOW)) s.repliedPhones.add(m.phone)

      if (sentAt >= recentCutoff) (recentRecipients[t] ??= []).push(m.phone)
    }

    const templates: TemplateStats[] = [...stats.values()]
      .map(({ repliedPhones, errors, ...s }) => ({
        ...s,
        replied: repliedPhones.size,
        topErrors: [...errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([error, count]) => ({ error, count })),
      }))
      .sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt))

    for (const t of Object.keys(recentRecipients)) recentRecipients[t] = [...new Set(recentRecipients[t])]

    return NextResponse.json({ days, templates, recentRecipients, repeatDays: TEMPLATE_REPEAT_DAYS })
  } catch (error) {
    return serverError('GET /api/whatsapp/campaigns/stats', error, 'Error al obtener resultados de campañas')
  }
}
