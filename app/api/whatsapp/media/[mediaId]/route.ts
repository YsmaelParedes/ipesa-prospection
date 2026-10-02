import { NextRequest } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { downloadWhatsAppMedia } from '@/lib/whatsapp'
import { getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import { jsonError } from '@/lib/validation'

// Tipos que se pueden mostrar dentro de la app sin riesgo. Cualquier otro
// (HTML, SVG, ejecutables…) se fuerza a descarga: lo envía un tercero y
// servirlo inline en nuestro dominio sería un XSS almacenado.
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|amr|opus)|video\/(mp4|3gpp)|application\/pdf)(;|$)/i

// GET /api/whatsapp/media/[mediaId] — proxy autenticado de multimedia entrante
export async function GET(_req: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const ctx = await requireStore({ module: 'whatsapp' })
  if (ctx instanceof Response) return ctx

  const { mediaId } = await params
  if (!/^\d{5,40}$/.test(mediaId)) return jsonError('Archivo no encontrado', 404)

  // Solo archivos que forman parte de las conversaciones de ESTA tienda
  const { data: msg } = await getServerSupabase()
    .from('whatsapp_messages').select('media_type').eq('store_id', ctx.storeId).eq('media_id', mediaId).limit(1).maybeSingle()
  if (!msg) return jsonError('Archivo no encontrado', 404)

  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  const file = creds ? await downloadWhatsAppMedia(creds, mediaId) : null
  if (!file) return jsonError('No se pudo descargar el archivo de WhatsApp (Meta lo conserva 30 días)', 502)

  const inline = INLINE_TYPES.test(file.mime)
  return new Response(file.body, {
    headers: {
      'Content-Type': inline ? file.mime : 'application/octet-stream',
      'Content-Disposition': inline ? 'inline' : `attachment; filename="whatsapp-${mediaId}"`,
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
