'use client'

import { useCallback, useEffect, useState } from 'react'
import { campaignEtaLabel } from '@/lib/whatsappSafety'

export type CampaignQuota = { sentToday: number; limit: number; remaining: number }

/** Cuota diaria restante de plantillas — para avisar antes de enviar (el límite lo hace cumplir el servidor). */
export function useWhatsAppCampaignQuota() {
  const [quota, setQuota] = useState<CampaignQuota | null>(null)
  const refetch = useCallback(() => {
    fetch('/api/whatsapp/campaigns/send')
      .then(r => r.json())
      .then(d => { if (d && typeof d.remaining === 'number') setQuota(d) })
      .catch(() => {})
  }, [])
  useEffect(refetch, [refetch])
  return { quota, refetch }
}

export function CampaignQuotaNote({ quota, selectedCount }: { quota: CampaignQuota | null; selectedCount: number }) {
  if (!quota) return null
  const overDaily = selectedCount > quota.remaining
  const pct = Math.min(100, Math.round((quota.sentToday / Math.max(1, quota.limit)) * 100))

  return (
    <div className={`wa-quota ${overDaily ? 'over' : ''}`}>
      <div className="wa-quota-top">
        <span>Cuota de hoy</span>
        <strong>{quota.remaining} de {quota.limit} disponibles</strong>
      </div>
      <div className="wa-quota-bar"><div style={{ width: `${pct}%` }} /></div>
      {selectedCount > 0 && !overDaily && (
        <div className="wa-quota-note">Enviar a {selectedCount} tomará {campaignEtaLabel(selectedCount)} (pausa de ~3 s entre cada uno para cuidar el número).</div>
      )}
      {overDaily && (
        <div className="wa-quota-note bad">Supera la cuota diaria restante ({quota.remaining}). Reduce la selección o espera a mañana.</div>
      )}
    </div>
  )
}
