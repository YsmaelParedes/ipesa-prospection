'use client'

import { useMemo } from 'react'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { CampaignSummary } from '@/lib/campaignKinds'
import { LANGUAGES } from '@/lib/templateBuilder'
import { STATE_LABEL, templateState } from '@/lib/whatsappTemplates'
import s from './plantillas.module.css'

export const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidad', AUTHENTICATION: 'Autenticación' }
export const languageLabel = (code: string) => LANGUAGES.find(([c]) => c === code)?.[1] ?? code
export const keyOf = (t: { name: string; language: string }) => `${t.name}|${t.language}`
export const fmt = (n: number) => n.toLocaleString('es-MX')

export function StatusBadge({ status }: { status: string }) {
  const st = templateState(status)
  return <span className={`${s.badge} ${s[`st-${st}`]}`}><i aria-hidden="true" />{STATE_LABEL[st]}</span>
}

export type TemplateStats = { sent: number; seen: number; replied: number }

/**
 * Cómo le fue a cada plantilla en las campañas de los últimos 90 días
 * (por nombre). Sin el módulo de campañas no se piden.
 */
export function useTemplateStats(enabled: boolean): Map<string, TemplateStats> | null {
  const { data } = useCachedQuery<{ campaigns: CampaignSummary[] }>(enabled ? '/api/whatsapp/campaigns/history?days=90' : null)
  return useMemo(() => {
    if (!data) return null
    const map = new Map<string, TemplateStats>()
    for (const c of data.campaigns) {
      const cur = map.get(c.template) ?? { sent: 0, seen: 0, replied: 0 }
      map.set(c.template, { sent: cur.sent + c.total - c.failed, seen: cur.seen + c.seen, replied: cur.replied + c.replied })
    }
    return map
  }, [data])
}
