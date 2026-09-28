'use client'

import { useEffect, useState } from 'react'
import { CAMPAIGN_SEND_DELAY_MS, CAMPAIGN_SEND_JITTER_MS } from '@/lib/whatsappSafety'

export type CampaignQuota = { sentToday: number; limit: number; remaining: number; maxPerRequest: number }

/** Cuota diaria restante de plantillas — para avisar antes de enviar, no para hacer cumplir el límite (eso lo hace el servidor). */
export function useWhatsAppCampaignQuota() {
  const [quota, setQuota] = useState<CampaignQuota | null>(null)
  const refetch = () => {
    fetch('/api/whatsapp/campaigns/send')
      .then(r => r.json())
      .then(d => { if (d && typeof d.remaining === 'number') setQuota(d) })
      .catch(() => {})
  }
  useEffect(refetch, [])
  return { quota, refetch }
}

const AVG_DELAY_SEC = (CAMPAIGN_SEND_DELAY_MS + CAMPAIGN_SEND_JITTER_MS / 2) / 1000

export function CampaignQuotaNote({ quota, selectedCount }: { quota: CampaignQuota | null; selectedCount: number }) {
  if (!quota) return null
  const overBatch = selectedCount > quota.maxPerRequest
  const overDaily = !overBatch && selectedCount > quota.remaining
  const etaSec = Math.round(selectedCount * AVG_DELAY_SEC)
  const etaText = etaSec < 60 ? `~${etaSec}s` : `~${Math.ceil(etaSec / 60)} min`

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 9, fontSize: 12.5, color: 'var(--ink-2)', marginTop: 10,
      background: (overDaily || overBatch) ? 'var(--ipesa-rose-soft)' : 'var(--paper)',
    }}>
      <div>Cuota de hoy: <strong>{quota.remaining}</strong> de {quota.limit} plantillas disponibles.</div>
      {selectedCount > 0 && !overBatch && !overDaily && (
        <div style={{ marginTop: 2 }}>Enviar a {selectedCount} tomará {etaText} (pausa de ~3s entre cada uno para cuidar el número).</div>
      )}
      {overBatch && (
        <div style={{ color: 'var(--ipesa-rose)', marginTop: 2, fontWeight: 600 }}>
          Máximo {quota.maxPerRequest} contactos por tanda — reduce la selección o manda el resto en otra tanda.
        </div>
      )}
      {!overBatch && overDaily && (
        <div style={{ color: 'var(--ipesa-rose)', marginTop: 2, fontWeight: 600 }}>
          Supera la cuota diaria restante ({quota.remaining}). Reduce la selección o espera a mañana.
        </div>
      )}
    </div>
  )
}
