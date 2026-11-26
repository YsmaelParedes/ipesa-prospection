import { withServerTiming } from '@/lib/serverTiming'
import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { getStoreWhatsAppCreds } from '@/lib/storeWhatsApp'
import {
  TemplateError, createTemplate, deleteTemplate, deleteTemplateMeta, editTemplate, forgetTemplates, managedTemplates,
  saveTemplateMeta, uploadSample,
} from '@/lib/whatsappTemplatesServer'
import { TEMPLATE_IMAGE_MAX, TEMPLATE_NAME_RE, detectImage, readTemplateImage, saveTemplateImage } from '@/lib/templateImage'
import { blockers, issuesOf, parseDraft, toComponents } from '@/lib/templateBuilder'
import { jsonError, serverError } from '@/lib/validation'

/** Límite de una petición en el servidor (la foto viaja en el mismo envío). */
const MAX_UPLOAD = 4 * 1024 * 1024

/**
 * GET /api/whatsapp/templates/manage (solo admin) — todas las plantillas de
 * la tienda con su estado en WhatsApp (aprobada, en revisión, rechazada…).
 */
async function GETImpl() {
  const ctx = await requireStore({ admin: true, module: 'whatsapp' })
  if (ctx instanceof Response) return ctx
  const creds = await getStoreWhatsAppCreds(ctx.storeId)
  if (!creds?.wabaId) return NextResponse.json({ templates: [], error: 'Falta conectar el WhatsApp de tu tienda.' })
  try {
    const { templates, error } = await managedTemplates(ctx.storeId, creds)
    return NextResponse.json(error ? { templates, error } : { templates })
  } catch (error) {
    return serverError('GET /api/whatsapp/templates/manage', error, 'No se pudieron consultar tus plantillas')
  }
}

/**
 * POST /api/whatsapp/templates/manage (solo admin) — FormData:
 *  · draft: el borrador (JSON, ver lib/templateBuilder.ts)
 *  · image: la foto del encabezado (JPG o PNG), si lleva
 *  · id: para corregir una plantilla que ya existe (sin id, se crea)
 *  · from: al duplicar, la plantilla de la que se toma la foto si no se elige otra
 * Se revisa igual que en la pantalla, se sube la foto de ejemplo a WhatsApp y
 * la plantilla queda en revisión. La foto se guarda también para Campañas.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx

  let form: FormData
  try { form = await req.formData() } catch { return jsonError('Formulario inválido') }
  let raw: unknown
  try { raw = JSON.parse(String(form.get('draft') ?? '')) } catch { return jsonError('Borrador inválido') }
  const draft = parseDraft(raw)
  if (!draft) return jsonError('Borrador inválido')
  const id = form.get('id')
  const editing = typeof id === 'string' && /^\d{1,30}$/.test(id) ? id : null
  if (form.get('id') !== null && !editing) return jsonError('id inválido')

  const from = form.get('from')
  if (from !== null && (typeof from !== 'string' || !TEMPLATE_NAME_RE.test(from))) return jsonError('from inválido')
  const file = form.get('image')
  let image: { bytes: Buffer; kind: { mime: string; ext: string } } | null = null
  // La foto se guarda para Campañas si es nueva o viene de otra plantilla (al corregir ya estaba)
  let keepImage = false
  if (file instanceof File && file.size > 0) {
    if (file.size > Math.min(TEMPLATE_IMAGE_MAX, MAX_UPLOAD)) return jsonError('La foto pesa más de 4 MB')
    const bytes = Buffer.from(await file.arrayBuffer())
    const kind = detectImage(bytes)
    if (!kind) return jsonError('La foto debe ser JPG o PNG (las que acepta WhatsApp)')
    image = { bytes, kind }
    keepImage = true
  }

  try {
    const creds = await getStoreWhatsAppCreds(ctx.storeId)
    if (!creds?.wabaId) return jsonError('Falta conectar el WhatsApp de tu tienda.', 409)
    const { templates } = await managedTemplates(ctx.storeId, creds)
    const current = editing ? templates.find(t => t.id === editing) : null
    if (editing && !current) return jsonError('No se encontró la plantilla', 404)
    // Al corregir, el nombre y el idioma no cambian
    if (current) { draft.name = current.name; draft.language = current.language }

    // Al corregir una con foto sin elegir otra, se vuelve a mandar la que ya tenía
    if (draft.header.kind === 'image' && !image && current) image = await readTemplateImage(ctx.storeId, draft.name)
    if (draft.header.kind === 'image' && !image && !current && typeof from === 'string') {
      image = await readTemplateImage(ctx.storeId, from)
      keepImage = !!image
    }
    const taken = new Set(templates.map(t => `${t.name}|${t.language}`))
    const problems = blockers(issuesOf(draft, { taken, hasImage: !!image, editing: !!current }))
    if (problems.length) return jsonError(problems[0].text)

    const handle = draft.header.kind === 'image' && image
      ? await uploadSample(creds, image.bytes, image.kind.mime, `${draft.name}.${image.kind.ext}`)
      : undefined
    const { components, clientName } = toComponents(draft, handle)

    let result: { id: string; status: string }
    if (current) {
      // Una aprobada no puede cambiar de tipo: se manda solo si cambió
      await editTemplate(creds, current.id, { components, ...(draft.category !== current.category ? { category: draft.category } : {}) })
      result = { id: current.id, status: 'PENDING' }
    } else {
      result = await createTemplate(creds, { name: draft.name, language: draft.language, category: draft.category, components })
    }

    await saveTemplateMeta(ctx.storeId, ctx.uid, draft.name, draft.language, clientName)
    if (image && keepImage && draft.header.kind === 'image') await saveTemplateImage(ctx.storeId, draft.name, image.bytes, image.kind)
    forgetTemplates(ctx.storeId)
    return NextResponse.json({ ok: true, ...result, name: draft.name, language: draft.language })
  } catch (error) {
    if (error instanceof TemplateError) return jsonError(error.message, error.status)
    return serverError('POST /api/whatsapp/templates/manage', error, 'No se pudo enviar la plantilla a revisión')
  }
}

/** DELETE /api/whatsapp/templates/manage?name=&language=&id= (solo admin) — la elimina en WhatsApp. */
export async function DELETE(req: NextRequest) {
  const ctx = await requireStore({ admin: true, module: 'whatsapp', write: true })
  if (ctx instanceof Response) return ctx
  const sp = req.nextUrl.searchParams
  const name = sp.get('name') ?? ''
  const language = sp.get('language') ?? ''
  const id = sp.get('id') ?? ''
  if (!TEMPLATE_NAME_RE.test(name)) return jsonError('name inválido')
  if (id && !/^\d{1,30}$/.test(id)) return jsonError('id inválido')
  if (language && !/^[a-zA-Z_]{2,10}$/.test(language)) return jsonError('language inválido')
  try {
    const creds = await getStoreWhatsAppCreds(ctx.storeId)
    if (!creds?.wabaId) return jsonError('Falta conectar el WhatsApp de tu tienda.', 409)
    await deleteTemplate(creds, name, id || undefined)
    await deleteTemplateMeta(ctx.storeId, name, id ? language || undefined : undefined)
    forgetTemplates(ctx.storeId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof TemplateError) return jsonError(error.message, error.status)
    return serverError('DELETE /api/whatsapp/templates/manage', error, 'No se pudo eliminar la plantilla')
  }
}

export const GET = withServerTiming(GETImpl)
