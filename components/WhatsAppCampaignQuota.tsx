'use client'

import { useCachedQuery } from '@/lib/useCachedQuery'


import { campaignEtaLabel } from '@/lib/whatsappSafety'

/** Límite real de Meta. `limit`/`remaining` null = nivel sin límite. */
export type CampaignQuota = {
  used: number
  limit: number | null
  remaining: number | null
  tier: string | null
  canSendMessage: string | null   // health_status de Meta: AVAILABLE | LIMITED | BLOCKED
  healthNotes: string[]
}

/** Personas que aún se pueden contactar hoy — para avisar antes de enviar (el límite lo hace cumplir el servidor). */
export function useWhatsAppCampaignQuota() {
  const query = useCachedQuery<CampaignQuota>('/api/whatsapp/campaigns/send')
  return { quota: query.data ?? null, refetch: () => { void query.reload().catch(() => {}) } }
}

/** ¿La selección supera lo que Meta aún permite hoy? */
export const isOverQuota = (quota: CampaignQuota | null, count: number) =>
  !!quota && quota.remaining !== null && count > quota.remaining

const fmt = (n: number) => n.toLocaleString('es-MX')

export function CampaignQuotaNote({ quota, selectedCount }: { quota: CampaignQuota | null; selectedCount: number }) {
  if (!quota) return null
  const over = isOverQuota(quota, selectedCount)
  const blocked = quota.canSendMessage === 'BLOCKED'
  const pct = quota.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0

  return (
    <div className={`wa-quota ${over || blocked ? 'over' : ''}`}>
      <div className="wa-quota-top">
        <span>Personas a las que puedes escribir hoy</span>
        <strong>{quota.remaining === null ? 'Sin límite' : `${fmt(quota.remaining)} de ${fmt(quota.limit ?? 0)}`}</strong>
      </div>
      {quota.limit !== null && <div className="wa-quota-bar"><div style={{ width: `${pct}%` }} /></div>}
      <div className="wa-quota-note">
        Es el límite de Meta para tu número: cuenta personas distintas en 24 h, no mensajes. Quien te escribió en las últimas 24 h no cuenta.
      </div>
      {blocked && (
        <div className="wa-quota-note bad">Meta tiene bloqueado el envío desde este número. {quota.healthNotes.join(' ')}</div>
      )}
      {!blocked && quota.canSendMessage === 'LIMITED' && quota.healthNotes.length > 0 && (
        <div className="wa-quota-note bad">Aviso de Meta: {quota.healthNotes.join(' ')}</div>
      )}
      {selectedCount > 0 && !over && !blocked && (
        <div className="wa-quota-note">Enviar a {fmt(selectedCount)} tomará {campaignEtaLabel(selectedCount)}.</div>
      )}
      {over && (
        <div className="wa-quota-note bad">Supera lo que Meta permite hoy ({fmt(quota.remaining ?? 0)}). Reduce la selección o espera a que se libere el límite (24 h móviles).</div>
      )}
    </div>
  )
}
