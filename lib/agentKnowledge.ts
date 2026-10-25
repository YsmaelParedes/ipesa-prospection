/**
 * Lo que sabe el agente de IA de Meta y sus reglas (cliente y servidor, sin
 * dependencias). Referencia: developers.facebook.com/documentation/meta-business-agent
 *  · Información de la tienda: {entity}/agent_config/business_info (GET/PUT, reemplaza todo)
 *  · Preguntas frecuentes:     {entity}/agent_config/faq (lista, POST, PUT/DELETE por id)
 *  · Archivos:                 {entity}/agent_config/files (multipart, DELETE por id)
 *  · Página web:               {entity}/agent_config/websites (Meta la lee sola)
 *  · Reglas ("skills"):        {entity}/agent_config/skills (Meta revisa cada una)
 */

/* ── Información de la tienda ─────────────────────────────────────────── */
export type BusinessInfo = {
  description: string; payment: string; purchase: string; delivery: string; returns: string
  hours: string; email: string; address: string
}
export const EMPTY_BUSINESS_INFO: BusinessInfo = { description: '', payment: '', purchase: '', delivery: '', returns: '', hours: '', email: '', address: '' }
export const MAX_BUSINESS_TEXT = 4000

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function toBusinessInfo(raw: any): BusinessInfo {
  const c = raw?.contact_info ?? {}
  return {
    description: str(raw?.business_description), payment: str(raw?.payment_method), purchase: str(raw?.purchase_info),
    delivery: str(raw?.delivery_and_shipping), returns: str(raw?.return_policy),
    hours: str(c.hours_of_operation), email: str(c.email), address: str(c.address),
  }
}

/** Cuerpo del PUT de Meta (reemplaza todo: se mandan todos los campos) o el texto del error. */
export function businessInfoPayload(input: Record<string, unknown>): Record<string, unknown> | string {
  const v = {} as BusinessInfo
  for (const key of Object.keys(EMPTY_BUSINESS_INFO) as (keyof BusinessInfo)[]) {
    const raw = input[key]
    if (raw !== undefined && typeof raw !== 'string') return 'Datos no válidos'
    v[key] = (raw ?? '').trim()
    if (v[key].length > MAX_BUSINESS_TEXT) return `Cada dato puede tener hasta ${MAX_BUSINESS_TEXT} caracteres`
  }
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'El correo no es válido'
  return {
    business_description: v.description, payment_method: v.payment, purchase_info: v.purchase,
    delivery_and_shipping: v.delivery, return_policy: v.returns,
    contact_info: { hours_of_operation: v.hours, email: v.email, address: v.address },
  }
}

/* ── Preguntas frecuentes ─────────────────────────────────────────────── */
export type Faq = { id: string; question: string; answer: string }
export const MAX_QUESTION = 300
export const MAX_ANSWER = 2000

export function toFaq(raw: any): Faq | null {
  return typeof raw?.id === 'string' ? { id: raw.id, question: str(raw.question), answer: str(raw.answer) } : null
}

export function faqPayload(input: Record<string, unknown>): { question: string; answer: string } | string {
  const question = str(input.question).trim()
  const answer = str(input.answer).trim()
  if (!question || !answer) return 'Escribe la pregunta y la respuesta'
  if (question.length > MAX_QUESTION) return `La pregunta puede tener hasta ${MAX_QUESTION} caracteres`
  if (answer.length > MAX_ANSWER) return `La respuesta puede tener hasta ${MAX_ANSWER} caracteres`
  return { question, answer }
}

/* ── Reglas (skills de Meta) ──────────────────────────────────────────── */
export type SkillStatus = 'active' | 'pending_review' | 'blocked'
export type Skill = { id: string; title: string; name: string; description: string; skill: string; status: SkillStatus }
export const MAX_SKILL_NAME = 64
export const MAX_SKILL_WHEN = 1024
export const MAX_SKILL_DO = 20000
export const SKILL_STATUS_LABELS: Record<SkillStatus, string> = { active: 'Activa', pending_review: 'En revisión', blocked: 'Rechazada' }

/** "Cotizaciones de obra" → "cotizaciones-de-obra" (Meta: minúsculas, números y guiones; máx. 64). */
export function skillSlug(name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_SKILL_NAME).replace(/-+$/g, '')
  return slug || 'regla'
}

/** "cotizaciones-de-obra" → "Cotizaciones de obra" */
export function skillName(title: string): string {
  const t = title.replace(/-/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : 'Regla'
}

export function toSkill(raw: any): Skill | null {
  if (typeof raw?.id !== 'string') return null
  const title = str(raw.title)
  const status: SkillStatus = raw.status === 'active' || raw.status === 'blocked' ? raw.status : 'pending_review'
  return { id: raw.id, title, name: skillName(title), description: str(raw.description), skill: str(raw.skill), status }
}

export function skillPayload(input: Record<string, unknown>): { title: string; description: string; skill: string } | string {
  const name = str(input.name).trim()
  const description = str(input.description).trim()
  const skill = str(input.skill).trim()
  if (!name) return 'Ponle un nombre a la regla'
  if (!description) return 'Escribe cuándo aplica la regla'
  if (!skill) return 'Escribe qué debe hacer la IA'
  if (description.length > MAX_SKILL_WHEN) return `«Cuándo aplica» puede tener hasta ${MAX_SKILL_WHEN} caracteres`
  if (skill.length > MAX_SKILL_DO) return `«Qué debe hacer» puede tener hasta ${MAX_SKILL_DO} caracteres`
  return { title: skillSlug(name), description, skill }
}

/** Reglas listas para encender con un toque (se crean como cualquier otra regla). */
export const SKILL_PRESETS = [
  {
    title: 'pide-informacion-del-cliente', icon: '🙋', name: 'Pide información del cliente',
    hint: 'Pregunta su nombre y qué necesita antes de cotizar.',
    description: 'Cuando un cliente pide precio, cotización o quiere comprar y todavía no sabemos qué necesita.',
    skill: '1. Pregunta su nombre.\n2. Pregunta qué producto necesita, para qué superficie y cuánto (litros, cubetas o metros cuadrados).\n3. Con eso, contesta o avisa que alguien del equipo le enviará la cotización.',
  },
  {
    title: 'no-dar-precios-exactos', icon: '💲', name: 'No dar precios exactos',
    hint: 'Da precios aproximados y ofrece una cotización del equipo.',
    description: 'Cuando un cliente pregunta cuánto cuesta un producto o un trabajo.',
    skill: 'No des precios exactos. Da un rango aproximado si lo conoces y ofrece que alguien del equipo le envíe la cotización exacta por este chat.',
  },
] as const

/* ── Página web ───────────────────────────────────────────────────────── */
export type WebsiteStatus = 'not_started' | 'pending' | 'in_progress' | 'completed' | 'completed_no_data' | 'failed'
export type Website = { id: string; url: string; status: WebsiteStatus; error: string; pages: number; lastCrawledAt: string | null }

const toIso = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return new Date(n < 1e12 ? n * 1000 : n).toISOString()
}

export function toWebsite(raw: any): Website | null {
  if (typeof raw?.id !== 'string') return null
  const statuses: WebsiteStatus[] = ['not_started', 'pending', 'in_progress', 'completed', 'completed_no_data', 'failed']
  return {
    id: raw.id, url: str(raw.url),
    status: statuses.includes(raw.crawl_status) ? raw.crawl_status : 'pending',
    error: str(raw.crawl_error), pages: Number(raw.pages_crawled) || 0, lastCrawledAt: toIso(raw.last_crawled_at),
  }
}

/** "tutienda.mx" → "https://tutienda.mx/"; null si no es una dirección web. */
export function websiteUrl(input: unknown): string | null {
  const text = str(input).trim()
  if (!text || text.length > 500) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null
    return url.toString()
  } catch { return null }
}

/* ── Archivos ─────────────────────────────────────────────────────────── */
export type KnowledgeFile = { id: string; name: string }
/** Tipos que Meta acepta siempre (CSV y Excel solo si Meta los activó para la cuenta). */
export const FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'] as const
/** Meta acepta hasta 100 MB, pero el servidor de la app recibe hasta 4 MB por petición. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024

export function toKnowledgeFile(raw: any): KnowledgeFile | null {
  return typeof raw?.id === 'string' ? { id: raw.id, name: str(raw.file_name) || 'Archivo' } : null
}

export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** Lista de Meta → objetos válidos (descarta lo que no traiga id). */
export function listOf<T>(raw: unknown, map: (x: any) => T | null): T[] {
  return Array.isArray(raw) ? raw.map(map).filter((x): x is T => x !== null) : []
}
