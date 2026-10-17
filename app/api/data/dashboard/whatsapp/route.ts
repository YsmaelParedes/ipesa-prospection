import { getDashboardWhatsAppUsage } from '@/lib/dashboardWhatsApp'
import { requireStore } from '@/lib/supabase-server'
import { withServerTiming } from '@/lib/serverTiming'
export const GET = withServerTiming(async () => {
  const ctx = await requireStore({ admin: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx
  const usage = await getDashboardWhatsAppUsage(ctx.storeId)
  if (!usage) return Response.json({ error: 'No se pudo consultar el uso de WhatsApp' }, { status: 503 })
  return Response.json({ people24h: usage.used, dailyLimit: usage.limit })
})
