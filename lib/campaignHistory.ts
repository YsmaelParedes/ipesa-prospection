/**
 * Historial de campañas de WhatsApp, armado a partir de los mensajes de
 * plantilla que ya guarda la app (whatsapp_messages): no hay tabla de
 * campañas. Un envío = los mensajes de una misma plantilla separados por
 * menos de BATCH_GAP_MS (una campaña se envía en pocos minutos). Solo servidor.
 */
import { fetchPaged } from './paged'
import { getServerSupabase } from './supabase-server'
import { FRIENDLY_ERRORS } from './whatsapp'
import { contactsForPhones } from './whatsappInbox'
import {
  BATCH_GAP_MS, REPLY_WINDOW_MS, campaignIdOf, parseCampaignId,
  type CampaignBucket, type CampaignDetail, type CampaignRecipient, type CampaignSummary, type FailureKind,
} from './campaignKinds'

export type OutboundRow = {
  id: string
  phone: string
  contact_id: string | null
  template_name: string
  status: string
  error_message: string | null
  created_at: string
  updated_at: string
}

export type Batch = {
  id: string
  template: string
  startMs: number
  endMs: number
  /** Un mensaje por número (el último intento). */
  rows: OutboundRow[]
  /** Cuántas veces se le intentó mandar a cada número dentro de la campaña. */
  attempts: Map<string, number>
}

const OUTBOUND_FIELDS = 'id, phone, contact_id, template_name, status, error_message, created_at, updated_at'

// ── Clasificación ────────────────────────────────────────────────────────────

const KIND_BY_CODE: Record<number, FailureKind> = {
  131026: 'no_whatsapp',
  131049: 'marketing_limit',
  131050: 'opt_out',
  131056: 'rate_limit', 130429: 'rate_limit',
  131048: 'quality', 131031: 'quality', 368: 'quality', 131064: 'quality',
  132000: 'template', 132001: 'template', 132012: 'template', 131009: 'template', 132015: 'template', 100: 'template',
  190: 'token',
}

// El webhook guarda el texto ya traducido (FRIENDLY_ERRORS), no el código:
// se recupera el código a partir de ese texto.
const CODE_BY_TEXT = new Map<string, number>([
  ...Object.entries(FRIENDLY_ERRORS).map(([code, text]) => [text, Number(code)] as [string, number]),
  // Textos anteriores (2.6.x) que siguen guardados en mensajes viejos
  ['Meta no entregó esta plantilla para cuidar la experiencia del usuario (límite de mensajes de marketing por persona). Intenta más adelante.', 131049],
  ['El cliente pidió dejar de recibir mensajes de marketing de este número.', 131050],
  ['Meta limitó el envío por baja calidad del número (muchos bloqueos o reportes). Pausa las campañas.', 131048],
])

// Títulos en inglés que Meta manda sin código (así quedaron guardados algunos envíos viejos)
const CODE_BY_META_TITLE: [RegExp, number][] = [
  [/^message undeliverable\b/i, 131026],
  [/healthy ecosystem engagement/i, 131049],
]

/** Motivo de un mensaje fallido a partir del texto que quedó guardado. */
export function failureKindOf(message: string | null | undefined): FailureKind {
  if (!message) return 'other'
  let code = CODE_BY_TEXT.get(message)
  if (code === undefined) {
    // Texto crudo de Meta, p. ej. "(#131026) Message undeliverable"
    const m = /\b(13[0-2]\d{3})\b/.exec(message)
    if (m) code = Number(m[1])
  }
  code ??= CODE_BY_META_TITLE.find(([re]) => re.test(message))?.[1]
  return (code !== undefined ? KIND_BY_CODE[code] : undefined) ?? 'other'
}

export function bucketOf(status: string): CampaignBucket {
  if (status === 'read') return 'read'
  if (status === 'delivered') return 'delivered'
  if (status === 'failed') return 'failed'
  return 'pending'
}

// ── Agrupación en campañas ───────────────────────────────────────────────────

/**
 * Agrupa mensajes de plantilla en campañas. Dentro de una campaña, si un
 * mismo número aparece varias veces (p. ej. un intento fallido y un reintento
 * inmediato) se conserva el último intento.
 */
export function groupIntoBatches(rows: OutboundRow[], gapMs = BATCH_GAP_MS): Batch[] {
  const sorted = rows
    .map(row => ({ row, t: Date.parse(row.created_at) }))
    .filter(x => Number.isFinite(x.t))
    .sort((a, b) =>
      (a.row.template_name < b.row.template_name ? -1 : a.row.template_name > b.row.template_name ? 1 : 0)
      || a.t - b.t
      || (a.row.id < b.row.id ? -1 : 1))

  const groups: { template: string; startMs: number; endMs: number; rows: OutboundRow[] }[] = []
  for (const { row, t } of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.template === row.template_name && t - last.endMs <= gapMs) {
      last.rows.push(row)
      last.endMs = t
    } else {
      groups.push({ template: row.template_name, startMs: t, endMs: t, rows: [row] })
    }
  }

  return groups.map(g => {
    const latestByPhone = new Map<string, OutboundRow>()
    const attempts = new Map<string, number>()
    for (const r of g.rows) { // ya están en orden cronológico
      latestByPhone.set(r.phone, r)
      attempts.set(r.phone, (attempts.get(r.phone) ?? 0) + 1)
    }
    return { id: campaignIdOf(g.template, g.startMs), template: g.template, startMs: g.startMs, endMs: g.endMs, rows: [...latestByPhone.values()], attempts }
  })
}

/** phone → instantes (ms, ascendente) de los mensajes entrantes. */
export function indexInbound(rows: { phone: string; created_at: string }[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const r of rows) {
    const t = Date.parse(r.created_at)
    if (!Number.isFinite(t)) continue
    const list = map.get(r.phone) ?? []
    list.push(t)
    map.set(r.phone, list)
  }
  for (const list of map.values()) list.sort((a, b) => a - b)
  return map
}

/** Números que escribieron dentro de REPLY_WINDOW_MS después de que se les entregó (no cuentan los fallidos). */
export function repliedPhonesOf(batch: Batch, inboundByPhone: ReadonlyMap<string, number[]>): Set<string> {
  const out = new Set<string>()
  for (const r of batch.rows) {
    if (r.status === 'failed') continue
    const sent = Date.parse(r.created_at)
    if (inboundByPhone.get(r.phone)?.some(t => t > sent && t - sent <= REPLY_WINDOW_MS)) out.add(r.phone)
  }
  return out
}

export function summarizeBatch(batch: Batch, replied: ReadonlySet<string>): CampaignSummary {
  const counts: Record<CampaignBucket, number> = { read: 0, delivered: 0, pending: 0, failed: 0 }
  const kinds = new Map<FailureKind, number>()
  for (const r of batch.rows) {
    const bucket = bucketOf(r.status)
    counts[bucket]++
    if (bucket === 'failed') {
      const kind = failureKindOf(r.error_message)
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    }
  }
  return {
    id: batch.id,
    template: batch.template,
    startedAt: new Date(batch.startMs).toISOString(),
    endedAt: new Date(batch.endMs).toISOString(),
    total: batch.rows.length,
    ...counts,
    replied: replied.size,
    failures: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
  }
}

// ── Consultas ────────────────────────────────────────────────────────────────

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

// fetchPaged vive en lib/paged.ts; se reexporta aquí porque campaignPeople la importa de este archivo
export { fetchPaged }

async function inboundFor(storeId: string, phones: string[], fromIso: string, toIso?: string) {
  const supabase = getServerSupabase()
  const parts = await Promise.all(chunks([...new Set(phones)], 150).map(part =>
    fetchPaged<{ phone: string; created_at: string }>((from, to) => {
      let q = supabase.from('whatsapp_messages').select('phone, created_at')
        .eq('store_id', storeId).eq('direction', 'inbound').in('phone', part).gte('created_at', fromIso)
      if (toIso) q = q.lte('created_at', toIso)
      return q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
    }),
  ))
  return parts.flat()
}

/** Campañas de los últimos `days` días, la más reciente primero. */
export async function loadCampaignSummaries(storeId: string, days: number): Promise<CampaignSummary[]> {
  const supabase = getServerSupabase()
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const rows = await fetchPaged<OutboundRow>((from, to) =>
    supabase.from('whatsapp_messages').select(OUTBOUND_FIELDS)
      .eq('store_id', storeId).eq('direction', 'outbound').not('template_name', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to))

  const batches = groupIntoBatches(rows)
  const okPhones = batches.flatMap(b => b.rows.filter(r => r.status !== 'failed').map(r => r.phone))
  const inbound = indexInbound(await inboundFor(storeId, okPhones, sinceIso))

  return batches
    .map(b => summarizeBatch(b, repliedPhonesOf(b, inbound)))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}

/** Detalle de una campaña: quién recibió el mensaje, quién no y por qué. */
export async function loadCampaignDetail(storeId: string, id: string): Promise<CampaignDetail | null> {
  const parsed = parseCampaignId(id)
  if (!parsed) return null
  const supabase = getServerSupabase()
  const startIso = new Date(parsed.startMs).toISOString()

  const rows = await fetchPaged<OutboundRow>((from, to) =>
    supabase.from('whatsapp_messages').select(OUTBOUND_FIELDS)
      .eq('store_id', storeId).eq('direction', 'outbound').eq('template_name', parsed.template)
      .gte('created_at', startIso)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to), 10000)

  const [batch, ...later] = groupIntoBatches(rows)
  if (!batch || batch.startMs !== parsed.startMs) return null

  // Envíos posteriores de la misma plantilla (p. ej. un reintento)
  const receivedLater = new Set(later.flatMap(b => b.rows.filter(r => r.status !== 'failed').map(r => r.phone)))

  const failedPhones = batch.rows.filter(r => r.status === 'failed').map(r => r.phone)
  const okPhones = batch.rows.filter(r => r.status !== 'failed').map(r => r.phone)

  const [contacts, priorFailures, inboundRows] = await Promise.all([
    contactsForPhones(storeId, batch.rows.map(r => r.phone), batch.rows.map(r => r.contact_id).filter((x): x is string => !!x)),
    Promise.all(chunks([...new Set(failedPhones)], 150).map(part =>
      fetchPaged<{ phone: string; error_message: string | null; created_at: string }>((from, to) =>
        supabase.from('whatsapp_messages').select('phone, error_message, created_at')
          .eq('store_id', storeId).eq('direction', 'outbound').eq('status', 'failed')
          .in('phone', part).lt('created_at', startIso)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)))).then(p => p.flat()),
    inboundFor(storeId, okPhones, startIso, new Date(batch.endMs + REPLY_WINDOW_MS).toISOString()),
  ])

  const byId = new Map([...contacts.values()].map(c => [c.id, c]))
  const replied = repliedPhonesOf(batch, indexInbound(inboundRows))

  // phone → { motivo → [veces, última fecha] } de los fallos anteriores a esta campaña
  const prior = new Map<string, Map<FailureKind, { count: number; last: string }>>()
  for (const f of priorFailures) {
    const kind = failureKindOf(f.error_message)
    const perPhone = prior.get(f.phone) ?? new Map<FailureKind, { count: number; last: string }>()
    const cur = perPhone.get(kind)
    perPhone.set(kind, { count: (cur?.count ?? 0) + 1, last: !cur || f.created_at > cur.last ? f.created_at : cur.last })
    prior.set(f.phone, perPhone)
  }

  const recipients: CampaignRecipient[] = batch.rows.map(r => {
    const bucket = bucketOf(r.status)
    const kind = bucket === 'failed' ? failureKindOf(r.error_message) : null
    const contact = contacts.get(r.phone) ?? (r.contact_id ? byId.get(r.contact_id) : undefined)
    const before = kind ? prior.get(r.phone)?.get(kind) : undefined
    return {
      phone: r.phone,
      contactId: contact?.id ?? r.contact_id ?? null,
      name: contact?.name ?? null,
      segment: contact?.segment ?? null,
      bucket,
      sentAt: r.created_at,
      updatedAt: r.updated_at,
      kind,
      error: bucket === 'failed' ? r.error_message : null,
      replied: replied.has(r.phone),
      previousFailures: before?.count ?? 0,
      lastFailedAt: before?.last ?? null,
      receivedLater: bucket === 'failed' && receivedLater.has(r.phone),
      attempts: batch.attempts.get(r.phone) ?? 1,
    }
  })

  return { ...summarizeBatch(batch, replied), recipients }
}
