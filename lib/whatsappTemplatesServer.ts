/**
 * Las plantillas de WhatsApp de una tienda, en vivo desde Meta: leerlas
 * (las aprobadas para enviar; todas para la sección Plantillas), crearlas,
 * corregirlas y eliminarlas. Lo que WhatsApp no guarda (si {{1}} es el
 * nombre del cliente) vive en whatsapp_template_meta. Solo servidor.
 */
import { GRAPH_VERSION, countTemplateVariables, graphFetch, type WhatsAppCreds } from './whatsapp'
import { externalFetch } from './serverTiming'
import { getServerSupabase } from './supabase-server'
import type { ManagedTemplate, TemplateButton, WhatsAppTemplateDef } from './whatsappTemplates'

// ── Lectura ──────────────────────────────────────────────────────────────────

const FIELDS = 'id,name,status,language,category,components,quality_score,rejected_reason'
const FIELDS_PLAIN = 'id,name,status,language,category,components,rejected_reason'
const MAX_PAGES = 10

/** Todas las plantillas de la cuenta (de 100 en 100). Si Meta no acepta quality_score, sin él. */
export async function fetchAllTemplates(creds: WhatsAppCreds): Promise<{ list: any[]; error?: string }> {
  if (!creds.wabaId) return { list: [], error: 'Falta el ID de la cuenta de WhatsApp Business (WABA) en Configuración → WhatsApp' }
  const first = (fields: string) => `${encodeURIComponent(creds.wabaId!)}/message_templates?fields=${fields}&limit=100`
  let fields = FIELDS
  let res = await graphFetch(creds, first(fields))
  if (!res.ok) { fields = FIELDS_PLAIN; res = await graphFetch(creds, first(fields)) }
  if (!res.ok) {
    console.error('[whatsapp templates]', res.data?.error?.message ?? res.status)
    return { list: [], error: `WhatsApp respondió con error ${res.status} al consultar las plantillas` }
  }
  const list: any[] = [...(res.data.data ?? [])]
  let after: string | undefined = res.data.paging?.cursors?.after
  let next: string | undefined = res.data.paging?.next
  for (let page = 1; next && after && page < MAX_PAGES; page++) {
    const more = await graphFetch(creds, `${first(fields)}&after=${encodeURIComponent(after)}`)
    if (!more.ok) break
    list.push(...(more.data.data ?? []))
    after = more.data.paging?.cursors?.after
    next = more.data.paging?.next
  }
  return { list }
}

const buttonOf = (b: any): TemplateButton => b.type === 'QUICK_REPLY' ? { kind: 'reply', text: String(b.text ?? '') }
  : b.type === 'URL' ? { kind: 'url', text: String(b.text ?? ''), url: b.url }
    : b.type === 'PHONE_NUMBER' ? { kind: 'call', text: String(b.text ?? ''), phone: b.phone_number }
      : { kind: 'other', text: String(b.text ?? '') }

/** La plantilla de Meta en la forma de la app. */
export function toDef(t: any, clientName = false): WhatsAppTemplateDef {
  const components = t.components ?? []
  const header  = components.find((c: any) => c.type === 'HEADER')
  const body    = components.find((c: any) => c.type === 'BODY')
  const footer  = components.find((c: any) => c.type === 'FOOTER')
  const buttons = components.find((c: any) => c.type === 'BUTTONS')?.buttons ?? []
  const bodyText: string = body?.text ?? ''

  // Casos que la app aún no sabe llenar: mejor avisarlo que dejar que Meta
  // rechace cada envío con "Number of parameters does not match".
  let unsupported: string | undefined
  if (header?.format === 'TEXT' && countTemplateVariables(header.text ?? '') > 0) unsupported = 'Tiene variables en el encabezado'
  else if (header?.format && !['TEXT', 'IMAGE'].includes(header.format)) unsupported = `Encabezado de tipo ${String(header.format).toLowerCase()}`
  else if (buttons.some((b: any) => b.type === 'URL' && /\{\{\d+\}\}/.test(b.url ?? ''))) unsupported = 'Tiene un botón con URL variable'
  else if (buttons.some((b: any) => b.type === 'COPY_CODE' || b.type === 'OTP')) unsupported = 'Tiene un botón de código'

  const buttonList = buttons.map(buttonOf)
  return {
    name: t.name,
    language: t.language,
    label: `${String(t.name).replace(/_/g, ' ')} (${t.language})`,
    category: t.category,
    hasImageHeader: header?.format === 'IMAGE',
    bodyPreview: bodyText,
    variableCount: countTemplateVariables(bodyText),
    footer: footer?.text,
    buttonLabel: buttons[0]?.text,
    buttons: buttonList.map((b: TemplateButton) => b.text).filter(Boolean),
    buttonList,
    headerText: header?.format === 'TEXT' && !countTemplateVariables(header.text ?? '') ? header.text : undefined,
    examples: Array.isArray(body?.example?.body_text?.[0]) ? body.example.body_text[0].map((v: unknown) => String(v ?? '')) : undefined,
    clientName: clientName && countTemplateVariables(bodyText) > 0,
    unsupported,
    quality: typeof t.quality_score?.score === 'string' ? t.quality_score.score : undefined,
  }
}

/** name|language de las plantillas hechas en Matices que usan el nombre del cliente. */
export async function clientNameKeys(storeId: string): Promise<Set<string>> {
  const { data, error } = await getServerSupabase().from('whatsapp_template_meta').select('name, language')
    .eq('store_id', storeId).eq('client_name', true)
  if (error) { console.error('[whatsapp_template_meta]', error.message); return new Set() }
  return new Set((data ?? []).map(r => `${r.name}|${r.language}`))
}

// Las aprobadas cambian poco: 5 min por tienda e instancia (selector de Campañas, chat, Contactos)
const approvedCache = new Map<string, { at: number; templates: WhatsAppTemplateDef[] }>()
const TTL = 5 * 60 * 1000

export async function approvedTemplates(storeId: string, creds: WhatsAppCreds): Promise<{ templates: WhatsAppTemplateDef[]; error?: string }> {
  const hit = approvedCache.get(storeId)
  if (hit && Date.now() - hit.at < TTL) return { templates: hit.templates }
  const [{ list, error }, names] = await Promise.all([fetchAllTemplates(creds), clientNameKeys(storeId)])
  if (error) return { templates: [], error }
  const templates = list.filter(t => t.status === 'APPROVED').map(t => toDef(t, names.has(`${t.name}|${t.language}`)))
  approvedCache.set(storeId, { at: Date.now(), templates })
  return { templates }
}

/** Tras crear, corregir o eliminar: la próxima consulta va a Meta. */
export const forgetTemplates = (storeId: string) => { approvedCache.delete(storeId) }

const HIDDEN = new Set(['DELETED', 'PENDING_DELETION', 'ARCHIVED'])

/** Todas las plantillas de la tienda con su estado (sección Plantillas). */
export async function managedTemplates(storeId: string, creds: WhatsAppCreds): Promise<{ templates: ManagedTemplate[]; error?: string }> {
  const [{ list, error }, names] = await Promise.all([fetchAllTemplates(creds), clientNameKeys(storeId)])
  if (error) return { templates: [], error }
  const templates = list.filter(t => !HIDDEN.has(t.status)).map(t => {
    const header = (t.components ?? []).find((c: any) => c.type === 'HEADER')
    return {
      ...toDef(t, names.has(`${t.name}|${t.language}`)),
      id: String(t.id ?? ''),
      status: String(t.status ?? ''),
      rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? String(t.rejected_reason) : undefined,
      headerFormat: header?.format,
    }
  })
  return { templates }
}

// ── Escritura ────────────────────────────────────────────────────────────────

export class TemplateError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** El error de Meta en palabras para la tienda (Meta suele mandar un título y un mensaje para el usuario). */
export function metaError(data: any, fallback: string): string {
  const e = data?.error ?? {}
  const sub = e.error_subcode as number | undefined
  if (sub === 2388023 || sub === 2388024) return 'Ya existe una plantilla con ese nombre (o se eliminó hace menos de 30 días). Usa otro nombre.'
  if (sub === 2388047 || sub === 2388072) return 'El formato del mensaje no es válido: revisa los datos que cambian y sus ejemplos.'
  if (sub === 2388299) return 'El mensaje no puede empezar ni terminar con un dato que cambia.'
  if (sub === 2388293) return 'Hay muchos datos que cambian para un mensaje tan corto: agrega más texto.'
  if (e.code === 4 || e.code === 80008 || sub === 2388042) return 'WhatsApp limitó los cambios por ahora. Una plantilla aprobada se puede editar una vez al día y hasta 10 veces al mes.'
  if (e.code === 190) return 'El acceso a WhatsApp venció: renueva la conexión en Configuración → WhatsApp.'
  const user = [e.error_user_title, e.error_user_msg].filter(Boolean).join(': ')
  return user || e.message || fallback
}

/**
 * Sube la foto de ejemplo para la revisión (carga reanudable de Meta) y
 * devuelve su «handle». Necesita el id de la app de Meta.
 */
export async function uploadSample(creds: WhatsAppCreds, bytes: Buffer, mime: string, fileName: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  if (!appId) throw new TemplateError('La conexión con WhatsApp no permite subir fotos todavía. Escríbenos para activarla.', 503)
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`
  // Como lo documenta Meta: la clave de acceso va en la dirección del primer paso
  const params = new URLSearchParams({ file_name: fileName, file_length: String(bytes.length), file_type: mime, access_token: creds.token })
  const start = await externalFetch(`${base}/${encodeURIComponent(appId)}/uploads?${params}`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
  })
  const session = await start.json().catch(() => ({}))
  if (!start.ok || typeof session.id !== 'string') throw new TemplateError(metaError(session, 'No se pudo subir la foto de ejemplo a WhatsApp.'), 502)
  const sent = await externalFetch(`${base}/${session.id}`, {
    method: 'POST', headers: { Authorization: `OAuth ${creds.token}`, file_offset: '0' }, body: new Uint8Array(bytes),
    cache: 'no-store', signal: AbortSignal.timeout(30_000),
  })
  const done = await sent.json().catch(() => ({}))
  if (!sent.ok || typeof done.h !== 'string') throw new TemplateError(metaError(done, 'No se pudo subir la foto de ejemplo a WhatsApp.'), 502)
  return done.h
}

export async function createTemplate(creds: WhatsAppCreds, input: { name: string; language: string; category: string; components: unknown[] }): Promise<{ id: string; status: string }> {
  if (!creds.wabaId) throw new TemplateError('Falta el ID de la cuenta de WhatsApp Business (WABA) en Configuración → WhatsApp', 409)
  const { ok, data } = await graphFetch(creds, `${encodeURIComponent(creds.wabaId)}/message_templates`, { method: 'POST', body: JSON.stringify(input) })
  if (!ok) throw new TemplateError(metaError(data, 'WhatsApp no aceptó la plantilla.'))
  return { id: String(data.id ?? ''), status: String(data.status ?? 'PENDING') }
}

/** Corregir una plantilla: se manda completa otra vez (el nombre y el idioma no cambian). */
export async function editTemplate(creds: WhatsAppCreds, id: string, input: { category?: string; components: unknown[] }): Promise<void> {
  const { ok, data } = await graphFetch(creds, encodeURIComponent(id), { method: 'POST', body: JSON.stringify(input) })
  if (!ok || data?.success === false) throw new TemplateError(metaError(data, 'WhatsApp no aceptó los cambios.'))
}

/** Elimina una plantilla (con `id`, solo ese idioma). */
export async function deleteTemplate(creds: WhatsAppCreds, name: string, id?: string): Promise<void> {
  if (!creds.wabaId) throw new TemplateError('Falta el ID de la cuenta de WhatsApp Business (WABA) en Configuración → WhatsApp', 409)
  const qs = new URLSearchParams({ name, ...(id ? { hsm_id: id } : {}) })
  const { ok, data } = await graphFetch(creds, `${encodeURIComponent(creds.wabaId)}/message_templates?${qs}`, { method: 'DELETE' })
  if (!ok) throw new TemplateError(metaError(data, 'WhatsApp no pudo eliminar la plantilla.'))
}

export async function saveTemplateMeta(storeId: string, userId: string, name: string, language: string, clientName: boolean): Promise<void> {
  const { error } = await getServerSupabase().from('whatsapp_template_meta').upsert(
    { store_id: storeId, name, language, client_name: clientName, created_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'store_id,name,language' })
  if (error) throw error
}

export async function deleteTemplateMeta(storeId: string, name: string, language?: string): Promise<void> {
  let q = getServerSupabase().from('whatsapp_template_meta').delete().eq('store_id', storeId).eq('name', name)
  if (language) q = q.eq('language', language)
  const { error } = await q
  if (error) throw error
}
