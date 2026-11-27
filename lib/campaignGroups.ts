/**
 * Campañas juntas: los envíos de la misma plantilla en el mismo día (por
 * ejemplo, uno por segmento) se ven como una sola campaña en la lista, con
 * sus números sumados; al abrirla, los resultados se ven juntos o por grupo.
 * Sin dependencias del servidor (tests/campaign-groups.test.cjs).
 */
import type { CampaignDetail, CampaignRecipient, CampaignSummary } from './campaignKinds'
import { shortNames } from './campaignWizard'

/** Día local AAAA-MM-DD de un envío. */
export function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type CampaignBundle = {
  /** `${plantilla}|${día}`: identifica la campaña junta (?g= en Campañas). */
  key: string
  template: string
  /** Los envíos que la forman, del primero al último. */
  ids: string[]
  /** El nombre de cada envío (sus grupos), sin repetir. */
  labels: string[]
  startedAt: string
  /** El envío más reciente (para ordenar la lista). */
  lastAt: string
  total: number
  failed: number
  seen: number
  replied: number
  pending: number
}

export const bundleKey = (c: Pick<CampaignSummary, 'template' | 'startedAt'>) => `${c.template}|${localDay(c.startedAt)}`

/** Junta los envíos por plantilla y día; la campaña más reciente primero. */
export function bundleCampaigns(list: CampaignSummary[]): CampaignBundle[] {
  const map = new Map<string, CampaignSummary[]>()
  for (const c of list) {
    const k = bundleKey(c)
    map.set(k, [...(map.get(k) ?? []), c])
  }
  return [...map].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    return {
      key,
      template: sorted[0].template,
      ids: sorted.map(c => c.id),
      labels: [...new Set(sorted.map(c => c.label?.trim()).filter((l): l is string => !!l))],
      startedAt: sorted[0].startedAt,
      lastAt: sorted[sorted.length - 1].startedAt,
      total: sum(sorted, 'total'), failed: sum(sorted, 'failed'), seen: sum(sorted, 'seen'),
      replied: sum(sorted, 'replied'), pending: sum(sorted, 'pending'),
    }
  }).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}

const sum = (list: CampaignSummary[], k: 'total' | 'failed' | 'seen' | 'replied' | 'pending') => list.reduce((n, c) => n + (c[k] ?? 0), 0)

/** «Herrero, Escuelas y 7 más» (o el nombre del único envío). */
export const bundleLabel = (labels: string[]) => (labels.length ? shortNames(labels) : null)

/** Un destinatario con el grupo del envío en que le llegó. */
export type GroupedRecipient = CampaignRecipient & { sendLabel?: string | null }

/**
 * Los resultados de varios envíos como si fueran uno: cada destinatario lleva
 * el nombre de su envío (su grupo); si a un número le llegó en dos envíos,
 * cuenta el último.
 */
export function mergeDetails(details: CampaignDetail[]): CampaignDetail & { recipients: GroupedRecipient[] } {
  if (details.length === 1) return details[0]
  const ordered = [...details].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
  const byPhone = new Map<string, GroupedRecipient>()
  for (const d of ordered) for (const r of d.recipients) byPhone.set(r.phone, { ...r, sendLabel: d.label })
  const recipients = [...byPhone.values()]
  const count = (pred: (r: GroupedRecipient) => boolean) => recipients.filter(pred).length
  const labels = [...new Set(ordered.map(d => d.label?.trim()).filter((l): l is string => !!l))]
  return {
    ...ordered[0],
    label: bundleLabel(labels),
    startedAt: ordered[0].startedAt,
    endedAt: ordered.reduce((m, d) => (d.endedAt > m ? d.endedAt : m), ordered[0].endedAt),
    total: recipients.length,
    read: count(r => r.bucket === 'read'),
    delivered: count(r => r.bucket === 'delivered'),
    pending: count(r => r.bucket === 'pending'),
    failed: count(r => r.bucket === 'failed'),
    replied: count(r => r.replied),
    seen: count(r => r.bucket === 'read' || (r.bucket !== 'failed' && r.replied)),
    failures: [],
    recipients,
  }
}
