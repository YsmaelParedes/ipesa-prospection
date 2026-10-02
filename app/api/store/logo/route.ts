import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requireStore } from '@/lib/supabase-server'
import { storeLogoUrl } from '@/lib/storeServer'
import { jsonError, serverError } from '@/lib/validation'

const BUCKET = 'store-assets'
const MAX_SIZE = 2 * 1024 * 1024

/** Tipo real por los primeros bytes (no confiar en el Content-Type del cliente). */
function detectImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: 'image/webp', ext: 'webp' }
  return null
}

// POST /api/store/logo (multipart: file) — dueño/admin
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return jsonError('Selecciona una imagen')
  if (file.size > MAX_SIZE) return jsonError('El logo debe pesar menos de 2 MB')

  const buffer = new Uint8Array(await file.arrayBuffer())
  const kind = detectImage(buffer)
  if (!kind) return jsonError('El logo debe ser PNG, JPG o WebP')

  const db = getServerSupabase()
  const path = `${ctx.storeId}/logo-${Date.now()}.${kind.ext}`
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: kind.mime, upsert: false })
  if (error) return serverError('POST /api/store/logo', error, 'No se pudo subir el logo')

  const previous = ctx.store.logo_path
  const { error: updateError } = await db.from('stores').update({ logo_path: path, updated_at: new Date().toISOString() }).eq('id', ctx.storeId)
  if (updateError) {
    await db.storage.from(BUCKET).remove([path])
    return serverError('POST /api/store/logo', updateError, 'No se pudo guardar el logo')
  }
  if (previous?.startsWith(`${ctx.storeId}/`)) await db.storage.from(BUCKET).remove([previous])
  invalidateMemberships()
  return NextResponse.json({ logoUrl: storeLogoUrl(path) })
}

// DELETE /api/store/logo — volver al logo genérico de IPESA
export async function DELETE() {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const db = getServerSupabase()
  const previous = ctx.store.logo_path
  const { error } = await db.from('stores').update({ logo_path: null, updated_at: new Date().toISOString() }).eq('id', ctx.storeId)
  if (error) return serverError('DELETE /api/store/logo', error, 'No se pudo quitar el logo')
  if (previous?.startsWith(`${ctx.storeId}/`)) await db.storage.from(BUCKET).remove([previous])
  invalidateMemberships()
  return NextResponse.json({ ok: true })
}
