/**
 * Reglas puras del asistente de Campañas (A quién → Plantilla → Enviar):
 * los grupos que se pueden elegir, cómo se nombra un envío y cómo se arma el
 * mensaje de una plantilla con sus datos. Sin dependencias de React ni del
 * servidor (tests/campaign-wizard.test.cjs).
 */
import type { AudienceBlock, AudienceContact } from './campaignAudience'

export const NO_SEGMENT = 'Sin segmento'
export const ALL_CLIENTS = 'Todos los clientes'

export const segmentOf = (c: { segment: string | null }) => c.segment?.trim() || NO_SEGMENT

/** Las plantillas de servicio no tienen la pausa de 24 h de marketing. */
export const isMarketing = (category?: string | null) => category !== 'UTILITY' && category !== 'AUTHENTICATION'

export type CampaignGroup = {
  name: string
  /** Quienes pueden recibirla (con celular, sin baja, sin fijo y con WhatsApp). */
  ids: string[]
  /** Quienes del grupo no pueden, por motivo. */
  blocked: Partial<Record<AudienceBlock, number>>
}

/**
 * Los grupos para elegir: uno por segmento, en el orden del catálogo (los que
 * no están en él, después; «Sin segmento», al final). Solo los que tienen a
 * alguien que pueda recibir la campaña.
 */
export function groupContacts(contacts: AudienceContact[], order: string[]): CampaignGroup[] {
  const map = new Map<string, CampaignGroup>()
  for (const c of contacts) {
    const name = segmentOf(c)
    const g = map.get(name) ?? { name, ids: [], blocked: {} }
    if (c.block) g.blocked[c.block] = (g.blocked[c.block] ?? 0) + 1
    else g.ids.push(c.id)
    map.set(name, g)
  }
  const rank = (n: string) => (n === NO_SEGMENT ? 1e6 : order.indexOf(n) >= 0 ? order.indexOf(n) : 1e5)
  return [...map.values()]
    .filter(g => g.ids.length > 0)
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'es'))
}

/** «Pintores», «Pintores y Hogar», «Pintores, Hogar y Hoteles» o «Pintores, Hogar y 2 más». */
export function shortNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? ''
  if (names.length < 4) return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`
}

/** Todos los nombres: «Pintores, Hogar, Hoteles y Constructoras». */
export function fullNames(names: string[]): string {
  return names.length < 2 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** «buen_fin_2026» → «Buen fin 2026». */
export function templateTitle(name: string): string {
  const t = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : name
}

/** El primer nombre, igual que lo arma el servidor al personalizar ({{1}}). */
export const firstNameOf = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || 'cliente'

// ── El mensaje de una plantilla ──────────────────────────────────────────────

/** Un pedazo del cuerpo: texto fijo, el nombre de cada cliente o un dato que se escribe ({{v+1}}). */
export type BodyPart = { text: string } | { name: true } | { v: number }

const VAR = /\{\{\s*(\d+)\s*\}\}/g

/** Las variables del cuerpo ({{1}} → 0, {{2}} → 1…), sin repetir y en orden. */
export function variablesOf(body: string): number[] {
  return [...new Set(Array.from(body.matchAll(VAR), m => Number(m[1]) - 1))].filter(n => n >= 0).sort((a, b) => a - b)
}

/** El cuerpo en pedazos; con `personalize`, {{1}} es el nombre de cada cliente. */
export function bodyParts(body: string, personalize: boolean): BodyPart[] {
  const out: BodyPart[] = []
  let last = 0
  for (const m of body.matchAll(VAR)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) })
    const v = Number(m[1]) - 1
    out.push(v === 0 && personalize ? { name: true } : { v })
    last = m.index! + m[0].length
  }
  if (last < body.length) out.push({ text: body.slice(last) })
  return out
}

/** Los datos que hay que escribir (todas las variables menos el nombre). */
export function blanksOf(body: string, personalize: boolean): number[] {
  return variablesOf(body).filter(v => !(v === 0 && personalize))
}

const GREETING = /^\s*[¡!]?\s*(hola|buen[oa]s?(\s+(d[ií]as|tardes|noches))?|estimad[oa]s?|querid[oa]s?|saludos|qu[eé]\s+tal|hey)\b[\s,:¡!]*\{\{\s*1\s*\}\}/i

/**
 * ¿{{1}} es el nombre del cliente? Sí cuando el mensaje empieza con él o con
 * un saludo seguido de él («Hola {{1}}, …»). Si no, se escribe como los demás
 * datos (y se puede cambiar en el paso 3).
 */
export function looksLikeName(body: string): boolean {
  return /^\s*\{\{\s*1\s*\}\}/.test(body) || GREETING.test(body)
}

/** Valores para el envío: {{n}} en orden (el {{1}} va vacío si es el nombre). */
export function paramsFor(body: string, personalize: boolean, values: Record<number, string>): string[] {
  const vars = variablesOf(body)
  const count = vars.length ? Math.max(...vars) + 1 : 0
  return Array.from({ length: count }, (_, i) => (i === 0 && personalize ? '' : (values[i] ?? '').trim()))
}

// ── Quién queda fuera ────────────────────────────────────────────────────────

export type OutReason = AudienceBlock | 'hold'

/** «3 sin WhatsApp», «1 se dio de baja»… */
export const OUT_WHY: Record<OutReason, [string, string]> = {
  opt_out: ['se dio de baja', 'se dieron de baja'],
  landline: ['con teléfono fijo', 'con teléfono fijo'],
  no_whatsapp: ['sin WhatsApp', 'sin WhatsApp'],
  hold: ['en pausa de 24 horas', 'en pausa de 24 horas'],
}

/** Etiqueta junto a una persona que no puede recibirla. */
export const BLOCK_TAG: Record<AudienceBlock, string> = {
  opt_out: 'Se dio de baja',
  landline: 'Teléfono fijo',
  no_whatsapp: 'Sin WhatsApp',
}
