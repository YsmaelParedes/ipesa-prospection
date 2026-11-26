/**
 * Plantillas de WhatsApp hechas en Matices: el borrador que se edita, lo que
 * WhatsApp rechazaría (para avisarlo antes) y cómo se convierte en la
 * plantilla que se manda a revisión. Sin dependencias de React ni del
 * servidor (tests/template-builder.test.cjs).
 *
 * En el borrador los datos se escriben con nombre: {{nombre}} es el nombre
 * de cada cliente y cualquier otro ({{fecha}}, {{dato_1}}…) se escribe al
 * mandar la campaña. Al enviarla, el nombre siempre es {{1}} y los demás
 * siguen en el orden en que aparecen.
 */
import type { TemplateButton, WhatsAppTemplateDef } from './whatsappTemplates'

export type TemplateCategory = 'MARKETING' | 'UTILITY'
export type DraftButtonKind = 'reply' | 'url' | 'call'
export type DraftButton = { kind: DraftButtonKind; text: string; url?: string; phone?: string }

export type TemplateDraft = {
  name: string
  category: TemplateCategory
  language: string
  header: { kind: 'none' | 'text' | 'image'; text: string }
  body: string
  /** Ejemplo de cada dato que se escribe (lo pide WhatsApp para revisarla). */
  examples: Record<string, string>
  footer: string
  buttons: DraftButton[]
}

export const NAME_KEY = 'nombre'
export const NAME_EXAMPLE = 'María'
export const BAJA_FOOTER = 'Responde BAJA si ya no quieres recibir promociones.'
export const LIMITS = { name: 512, header: 60, body: 1024, footer: 60, button: 25, buttons: 10, url: 2, call: 1, example: 200 }
export const LANGUAGES: [string, string][] = [['es_MX', 'Español (México)'], ['es', 'Español'], ['en_US', 'Inglés (EE. UU.)']]
export const BUTTON_KINDS: Record<DraftButtonKind, { label: string; max: number }> = {
  reply: { label: 'Respuesta rápida', max: 10 },
  url: { label: 'Visitar sitio web', max: LIMITS.url },
  call: { label: 'Llamar por teléfono', max: LIMITS.call },
}

export const emptyDraft = (category: TemplateCategory = 'MARKETING'): TemplateDraft => ({
  name: '', category, language: 'es_MX', header: { kind: 'none', text: '' }, body: '', examples: {},
  footer: category === 'MARKETING' ? BAJA_FOOTER : '', buttons: [],
})

/** Para nombres y claves: sin acentos, minúsculas y guion bajo. */
export function slug(text: string, max = 60): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/, '')
}

const TOKEN = /\{\{([^{}]*)\}\}/g

/** Los datos del mensaje, sin repetir, en el orden en que aparecen. */
export function tokensOf(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(TOKEN), m => slug(m[1], 30)).filter(Boolean))]
}

/** Los que se escriben al mandar la campaña (todos menos el nombre). */
export const dataKeys = (body: string) => tokensOf(body).filter(k => k !== NAME_KEY)

/** El siguiente «dato_N» libre. */
export function nextDataKey(body: string): string {
  const used = new Set(tokensOf(body))
  let n = 1
  while (used.has(`dato_${n}`)) n++
  return `dato_${n}`
}

const PROMO = /(descuento|oferta|promo|%|gratis|rebaja|aprovecha|2x1|liquidaci[oó]n|cup[oó]n)/i
export const looksPromotional = (text: string) => PROMO.test(text)

const EMOJI = /\p{Extended_Pictographic}/u
const PHONE_DIGITS = (p: string) => p.replace(/\D/g, '')

/** +52 y 10 dígitos (si escriben solo los 10, se le pone el +52). */
export function normalizePhone(p: string): string {
  const d = PHONE_DIGITS(p)
  if (d.length === 10) return `+52${d}`
  return d ? `+${d}` : ''
}

export type Issue = { field: 'name' | 'header' | 'body' | 'examples' | 'footer' | 'buttons'; text: string; warn?: boolean }

/**
 * Lo que falta o WhatsApp rechazaría. `warn` no impide enviarla (es un
 * consejo). `taken`: nombres+idioma que ya existen en la tienda.
 */
export function issuesOf(d: TemplateDraft, opts: { taken?: Set<string>; hasImage?: boolean; editing?: boolean } = {}): Issue[] {
  const out: Issue[] = []
  // Nombre
  if (!d.name) out.push({ field: 'name', text: 'Ponle un nombre a la plantilla.' })
  else if (!/^[a-z0-9_]+$/.test(d.name)) out.push({ field: 'name', text: 'El nombre solo puede llevar minúsculas, números y guion bajo.' })
  else if (d.name.length > LIMITS.name) out.push({ field: 'name', text: 'El nombre es demasiado largo.' })
  else if (!opts.editing && opts.taken?.has(`${d.name}|${d.language}`)) out.push({ field: 'name', text: 'Ya tienes una plantilla con ese nombre en ese idioma.' })

  // Encabezado
  if (d.header.kind === 'text') {
    const t = d.header.text.trim()
    if (!t) out.push({ field: 'header', text: 'Escribe el texto del encabezado o quítalo.' })
    else if (t.length > LIMITS.header) out.push({ field: 'header', text: `El encabezado lleva máximo ${LIMITS.header} caracteres.` })
    else if (/\{\{|\}\}/.test(t)) out.push({ field: 'header', text: 'El encabezado no puede llevar datos que cambian.' })
    else if (/[\n*_~]/.test(t) || EMOJI.test(t)) out.push({ field: 'header', text: 'El encabezado no puede llevar emojis, formato ni saltos de línea.' })
  }
  if (d.header.kind === 'image' && !opts.hasImage) out.push({ field: 'header', text: 'Elige la foto del encabezado.' })

  // Mensaje
  const body = d.body.trim()
  const keys = tokensOf(body)
  if (!body) out.push({ field: 'body', text: 'Escribe el mensaje.' })
  else {
    if (body.length > LIMITS.body) out.push({ field: 'body', text: `El mensaje lleva máximo ${LIMITS.body.toLocaleString('es-MX')} caracteres (tiene ${body.length.toLocaleString('es-MX')}).` })
    if (/\{\{\s*\}\}/.test(body) || (body.match(/\{\{/g)?.length ?? 0) !== (body.match(/\}\}/g)?.length ?? 0)) out.push({ field: 'body', text: 'Hay un dato mal escrito: usa {{nombre}} o {{dato}}, con dos llaves de cada lado.' })
    if (/^\{\{[^{}]*\}\}/.test(body)) out.push({ field: 'body', text: 'El mensaje no puede empezar con un dato que cambia: agrega un saludo antes (por ejemplo «Hola»).' })
    if (/\{\{[^{}]*\}\}\s*$/.test(body)) out.push({ field: 'body', text: 'El mensaje no puede terminar con un dato que cambia: agrega texto después.' })
    if (/\}\}\s*\{\{/.test(body)) out.push({ field: 'body', text: 'Dos datos que cambian no pueden ir juntos: escribe texto entre ellos.' })
    const words = body.replace(TOKEN, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length
    if (keys.length && words < keys.length * 3 + 1) out.push({ field: 'body', text: 'Hay muchos datos que cambian para un mensaje tan corto: agrega más texto.' })
    if (/\n{3,}/.test(body)) out.push({ field: 'body', text: 'Deja como máximo una línea en blanco seguida.' })
    if (d.category === 'UTILITY' && looksPromotional(`${body} ${d.header.text}`)) out.push({ field: 'body', warn: true, text: 'Parece una promoción: WhatsApp podría pasarla a Marketing. Si es una promoción, cambia el tipo.' })
  }

  // Ejemplos de los datos que se escriben
  for (const k of keys) {
    if (k === NAME_KEY) continue
    const ex = (d.examples[k] ?? '').trim()
    if (!ex) out.push({ field: 'examples', text: `Escribe un ejemplo para «${k.replace(/_/g, ' ')}».` })
    else if (ex.length > LIMITS.example || /\{\{|\}\}|\n/.test(ex)) out.push({ field: 'examples', text: `El ejemplo de «${k.replace(/_/g, ' ')}» no es válido.` })
  }

  // Pie
  const foot = d.footer.trim()
  if (foot.length > LIMITS.footer) out.push({ field: 'footer', text: `El pie lleva máximo ${LIMITS.footer} caracteres.` })
  else if (/\{\{|\}\}/.test(foot)) out.push({ field: 'footer', text: 'El pie no puede llevar datos que cambian.' })
  if (d.category === 'MARKETING' && !/\bbaja\b|\bstop\b/i.test(foot)) out.push({ field: 'footer', warn: true, text: 'Agrega «Responde BAJA…» en el pie: así tus clientes pueden darse de baja y cuidas la calidad de tu número.' })

  // Botones
  if (d.buttons.length > LIMITS.buttons) out.push({ field: 'buttons', text: `Máximo ${LIMITS.buttons} botones.` })
  for (const kind of Object.keys(BUTTON_KINDS) as DraftButtonKind[]) {
    const n = d.buttons.filter(b => b.kind === kind).length
    if (n > BUTTON_KINDS[kind].max) out.push({ field: 'buttons', text: `Máximo ${BUTTON_KINDS[kind].max} ${kind === 'url' ? 'botones de sitio web' : 'botón de llamar'}.` })
  }
  const texts = d.buttons.map(b => b.text.trim().toLowerCase())
  d.buttons.forEach((b, i) => {
    const t = b.text.trim()
    const n = `el botón ${i + 1}`
    if (!t) out.push({ field: 'buttons', text: `Escribe el texto de ${n}.` })
    else if (t.length > LIMITS.button) out.push({ field: 'buttons', text: `El texto de ${n} lleva máximo ${LIMITS.button} caracteres.` })
    else if (texts.indexOf(t.toLowerCase()) !== i) out.push({ field: 'buttons', text: `Hay dos botones que dicen «${t}».` })
    if (b.kind === 'url') {
      let ok = false
      try { const u = new URL((b.url ?? '').trim()); ok = /^https?:$/.test(u.protocol) && !!u.hostname.includes('.') } catch { ok = false }
      if (!ok) out.push({ field: 'buttons', text: `Escribe una dirección web válida en ${n} (que empiece con https://).` })
      else if (/\{\{|\}\}/.test(b.url ?? '')) out.push({ field: 'buttons', text: `La dirección de ${n} no puede llevar datos que cambian.` })
    }
    if (b.kind === 'call' && !/^\+\d{11,15}$/.test(normalizePhone(b.phone ?? ''))) out.push({ field: 'buttons', text: `Escribe el teléfono de ${n} a 10 dígitos.` })
  })
  return out
}

/** Solo lo que impide enviarla. */
export const blockers = (issues: Issue[]) => issues.filter(i => !i.warn)

/** Orden de las variables: el nombre es {{1}}; los demás, en el orden en que aparecen. */
export function numbering(body: string): { order: string[]; clientName: boolean } {
  const keys = tokensOf(body)
  const clientName = keys.includes(NAME_KEY)
  return { order: clientName ? [NAME_KEY, ...keys.filter(k => k !== NAME_KEY)] : keys, clientName }
}

/** El cuerpo con {{1}}, {{2}}… y los ejemplos en ese orden. */
export function numberedBody(d: Pick<TemplateDraft, 'body' | 'examples'>): { text: string; examples: string[]; clientName: boolean } {
  const { order, clientName } = numbering(d.body)
  const text = d.body.trim().replace(TOKEN, (_, raw: string) => `{{${order.indexOf(slug(raw, 30)) + 1}}}`)
  const examples = order.map(k => (k === NAME_KEY ? (d.examples[k]?.trim() || NAME_EXAMPLE) : (d.examples[k] ?? '').trim()))
  return { text, examples, clientName }
}

/** Botones en el orden que pide WhatsApp: respuestas rápidas juntas y luego los demás. */
export function orderedButtons(buttons: DraftButton[]): DraftButton[] {
  return [...buttons.filter(b => b.kind === 'reply'), ...buttons.filter(b => b.kind !== 'reply')]
}

/**
 * Los componentes que pide WhatsApp para crearla o editarla. `headerHandle`:
 * la foto de ejemplo ya subida (encabezado de imagen).
 */
export function toComponents(d: TemplateDraft, headerHandle?: string): { components: Record<string, unknown>[]; clientName: boolean } {
  const { text, examples, clientName } = numberedBody(d)
  const components: Record<string, unknown>[] = []
  if (d.header.kind === 'text') components.push({ type: 'HEADER', format: 'TEXT', text: d.header.text.trim() })
  if (d.header.kind === 'image') components.push({ type: 'HEADER', format: 'IMAGE', ...(headerHandle ? { example: { header_handle: [headerHandle] } } : {}) })
  components.push({ type: 'BODY', text, ...(examples.length ? { example: { body_text: [examples] } } : {}) })
  if (d.footer.trim()) components.push({ type: 'FOOTER', text: d.footer.trim() })
  if (d.buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: orderedButtons(d.buttons).map(b => b.kind === 'reply' ? { type: 'QUICK_REPLY', text: b.text.trim() }
        : b.kind === 'url' ? { type: 'URL', text: b.text.trim(), url: (b.url ?? '').trim() }
          : { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: normalizePhone(b.phone ?? '') }),
    })
  }
  return { components, clientName }
}

/** Cómo se ve el borrador (para la vista previa y para Campañas). */
export function draftAsDef(d: TemplateDraft): WhatsAppTemplateDef {
  const { text, examples, clientName } = numberedBody(d)
  const buttonList: TemplateButton[] = orderedButtons(d.buttons).map(b => ({ kind: b.kind, text: b.text.trim() || 'Botón' }))
  return {
    name: d.name || 'nueva_plantilla', language: d.language, label: d.name, category: d.category,
    hasImageHeader: d.header.kind === 'image', headerText: d.header.kind === 'text' ? d.header.text.trim() : undefined,
    bodyPreview: text, variableCount: examples.length, examples, footer: d.footer.trim() || undefined,
    buttons: buttonList.map(b => b.text), buttonList, clientName,
  }
}

/** Un borrador a partir de una plantilla que ya existe (para corregirla o duplicarla). */
export function draftFromTemplate(t: WhatsAppTemplateDef): TemplateDraft {
  const examples: Record<string, string> = {}
  const keyFor = new Map<number, string>()
  let k = 0
  const body = t.bodyPreview.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => {
    const i = Number(n)
    if (!keyFor.has(i)) {
      const key = i === 1 && t.clientName ? NAME_KEY : `dato_${++k}`
      keyFor.set(i, key)
      const ex = t.examples?.[i - 1]?.trim()
      if (ex && key !== NAME_KEY) examples[key] = ex
    }
    return `{{${keyFor.get(i)}}}`
  })
  return {
    name: t.name,
    category: t.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
    language: t.language,
    header: t.hasImageHeader ? { kind: 'image', text: '' } : t.headerText ? { kind: 'text', text: t.headerText } : { kind: 'none', text: '' },
    body,
    examples,
    footer: t.footer ?? '',
    buttons: (t.buttonList ?? (t.buttons ?? []).map((text): TemplateButton => ({ kind: 'reply', text })))
      .filter(b => b.kind === 'reply' || b.kind === 'url' || b.kind === 'call')
      .map(b => ({ kind: b.kind as DraftButtonKind, text: b.text, url: b.url, phone: b.phone })),
  }
}

/** Revisa la forma de lo que manda el navegador (los textos se revisan con issuesOf). */
export function parseDraft(raw: unknown): TemplateDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, any>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  if (r.category !== 'MARKETING' && r.category !== 'UTILITY') return null
  if (typeof r.language !== 'string' || !LANGUAGES.some(([code]) => code === r.language)) return null
  const headerKind = r.header?.kind
  if (!['none', 'text', 'image'].includes(headerKind)) return null
  if (!Array.isArray(r.buttons) || r.buttons.length > LIMITS.buttons) return null
  const buttons: DraftButton[] = []
  for (const b of r.buttons) {
    if (!b || !['reply', 'url', 'call'].includes(b.kind)) return null
    buttons.push({ kind: b.kind, text: str(b.text, 60), ...(b.kind === 'url' ? { url: str(b.url, 2000) } : {}), ...(b.kind === 'call' ? { phone: str(b.phone, 30) } : {}) })
  }
  const examples: Record<string, string> = {}
  if (r.examples && typeof r.examples === 'object') {
    for (const [k, v] of Object.entries(r.examples).slice(0, 30)) if (/^[a-z0-9_]{1,30}$/.test(k)) examples[k] = str(v, 300)
  }
  return {
    name: str(r.name, LIMITS.name + 1), category: r.category, language: r.language,
    header: { kind: headerKind, text: str(r.header?.text, 200) },
    body: str(r.body, 4000), examples, footer: str(r.footer, 200), buttons,
  }
}

/** Nombre sugerido a partir de las primeras palabras del mensaje o del modelo. */
export const suggestName = (text: string) => slug(text.replace(TOKEN, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).slice(0, 4).join(' '), 40)
