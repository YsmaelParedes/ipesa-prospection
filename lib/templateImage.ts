/**
 * La foto del encabezado de cada plantilla: se guarda una vez por plantilla
 * (bucket whatsapp-media, <store_id>/<plantilla>.<ext>) y Campañas la reusa
 * en cada envío. Solo servidor.
 */
import { getServerSupabase } from './supabase-server'
import { getStoreWhatsAppRow } from './storeWhatsApp'

export const TEMPLATE_IMAGE_BUCKET = 'whatsapp-media'
/** Límite de WhatsApp para la foto de una plantilla. */
export const TEMPLATE_IMAGE_MAX = 5 * 1024 * 1024
export const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/

/**
 * WhatsApp solo acepta JPEG y PNG en encabezados de plantilla. El tipo se
 * revisa en los bytes reales del archivo (el `type` del navegador se puede falsificar).
 */
export function detectImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpeg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  return null
}

/** La foto guardada de una plantilla. La tienda original conserva las que subió antes en la raíz del bucket. */
export async function findTemplateImage(storeId: string, template: string) {
  const supabase = getServerSupabase()
  const { data, error } = await supabase.storage.from(TEMPLATE_IMAGE_BUCKET).list(storeId, { search: template })
  if (error) throw error
  const own = (data ?? []).find(f => f.name.startsWith(`${template}.`))
  if (own) return { path: `${storeId}/${own.name}`, updatedAt: own.updated_at as string | null }
  if ((await getStoreWhatsAppRow(storeId))?.credentials_source === 'env') {
    const { data: legacy } = await supabase.storage.from(TEMPLATE_IMAGE_BUCKET).list('', { search: template })
    const old = (legacy ?? []).find(f => f.name.startsWith(`${template}.`))
    if (old) return { path: old.name, updatedAt: old.updated_at as string | null }
  }
  return null
}

export function publicImageUrl(path: string, version?: string | number | null): string {
  const { data } = getServerSupabase().storage.from(TEMPLATE_IMAGE_BUCKET).getPublicUrl(path)
  return version ? `${data.publicUrl}?v=${version}` : data.publicUrl
}

/** Guarda (o reemplaza) la foto de una plantilla y devuelve su dirección pública. */
export async function saveTemplateImage(storeId: string, template: string, bytes: Buffer, kind: { mime: string; ext: string }): Promise<string> {
  const supabase = getServerSupabase()
  // Quita versiones con otra extensión para no acumular archivos sueltos
  const { data: existing } = await supabase.storage.from(TEMPLATE_IMAGE_BUCKET).list(storeId, { search: template })
  const stale = (existing ?? []).filter(f => f.name.startsWith(`${template}.`)).map(f => `${storeId}/${f.name}`)
  if (stale.length) await supabase.storage.from(TEMPLATE_IMAGE_BUCKET).remove(stale)
  const path = `${storeId}/${template}.${kind.ext}`
  const { error } = await supabase.storage.from(TEMPLATE_IMAGE_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: true })
  if (error) throw error
  return publicImageUrl(path, Date.now())
}

/** Los bytes de la foto guardada (para volver a mandarla como ejemplo al corregir una plantilla). */
export async function readTemplateImage(storeId: string, template: string): Promise<{ bytes: Buffer; kind: { mime: string; ext: string } } | null> {
  const found = await findTemplateImage(storeId, template)
  if (!found) return null
  const { data, error } = await getServerSupabase().storage.from(TEMPLATE_IMAGE_BUCKET).download(found.path)
  if (error || !data) return null
  const bytes = Buffer.from(await data.arrayBuffer())
  const kind = detectImage(bytes)
  return kind ? { bytes, kind } : null
}
