import { withServerTiming } from '@/lib/serverTiming'
import { NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { approvedTemplates } from '@/lib/whatsappTemplatesServer'

/**
 * GET /api/whatsapp/templates — plantillas APROBADAS consultadas en vivo a
 * Meta (5 min en memoria por tienda). Responde 200 con `error` (y
 * templates: []) si falla, para que el selector muestre el motivo sin romper
 * la UI. Todas, con su estado: /api/whatsapp/templates/manage.
 */
async function GETImpl() {
  const ctx = await requireStore({ module: 'whatsapp' })
  if (ctx instanceof Response) return ctx

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds?.wabaId) {
    return NextResponse.json({ error: 'Falta el ID de la cuenta de WhatsApp Business (WABA) en Configuración → WhatsApp', templates: [] })
  }
  try {
    const { templates, error } = await approvedTemplates(ctx.storeId, creds)
    return NextResponse.json(error ? { error, templates } : { templates })
  } catch {
    return NextResponse.json({ error: 'Error de red al consultar plantillas en Meta', templates: [] })
  }
}

export const GET = withServerTiming(GETImpl)
