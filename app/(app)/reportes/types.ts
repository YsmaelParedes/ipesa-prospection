import type { DayCounts, Goals } from '@/lib/commercial'
import type { Bucket, Preset } from '@/lib/reports'
import type { FilterOptions } from './ReportFilters'

/** Un vendedor en Desempeño: lo del periodo, lo del anterior y su meta. */
export type PerfPerson = {
  user_id: string; name: string; custom: boolean
  counts: DayCounts; prev: DayCounts; goals: Goals; compliance: number; prevCompliance: number
}

export type OpenQuote = { id: string; folio: number | null; client_name: string; total: number | string; valid_until: string; sent_at: string | null }

/** Respuesta de /api/data/commercial/summary (Desempeño y Mi avance). */
export type PerfData = {
  scope: 'store' | 'mine'
  period: Preset; from: string; to: string; end: string; today: string
  prevFrom: string; prevEnd: string; partial: boolean
  goalDays: number; fullDays: number; startedDays: number; elapsedDays: number
  totals: DayCounts; prev: DayCounts; goals: Goals; compliance: number; prevCompliance: number
  quotedOutcome: { open: number; won: number; lost: number }
  people: PerfPerson[]
  newClients: number; prevNewClients: number
  series: {
    axis: string[]; sold: (number | null)[]; prevSold: number[]; bucket: Bucket
    activity: { start: string; label: string; count: number; current: boolean }[]
  }
  byZone: { name: string; value: number }[]
  bySegment: { name: string; value: number }[]
  openQuotes?: { count: number; total: number; items: OpenQuote[] }
  options: FilterOptions
}
