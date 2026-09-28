'use client'

import { useRef, useState } from 'react'
import { campaignDelayMs, wait } from '@/lib/whatsappSafety'
import type { WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import type { CampaignQuota } from '@/components/WhatsAppCampaignQuota'

export type CampaignTarget = { id: string; name: string; phone: string | null }
export type CampaignOutcome = { contactId: string; name: string; ok: boolean; error?: string }

export type CampaignPhase = 'idle' | 'confirm' | 'sending' | 'results'

const AVG_DELAY_SEC = (3000 + 800 / 2) / 1000 // debe reflejar CAMPAIGN_SEND_DELAY_MS/JITTER de lib/whatsappSafety

export function etaLabel(count: number): string {
  const sec = Math.round(count * AVG_DELAY_SEC)
  return sec < 60 ? `~${sec}s` : `~${Math.ceil(sec / 60)} min`
}

/** Orquesta el flujo confirmar → enviar uno por uno con pausa → resultados, para reusar entre Contactos y WhatsApp > Campañas. */
export function useCampaignSend() {
  const [phase, setPhase]   = useState<CampaignPhase>('idle')
  const [total, setTotal]   = useState(0)
  const [done, setDone]     = useState(0)
  const [outcomes, setOutcomes] = useState<CampaignOutcome[]>([])
  const [fatalError, setFatalError] = useState('')
  const cancelRef = useRef(false)

  const askConfirm = () => { setFatalError(''); setPhase('confirm') }
  const backToForm = () => setPhase('idle')

  const run = async (targets: CampaignTarget[], selection: WhatsAppTemplateSelection) => {
    cancelRef.current = false
    setPhase('sending'); setTotal(targets.length); setDone(0); setOutcomes([]); setFatalError('')
    const out: CampaignOutcome[] = []

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break
      const t = targets[i]
      if (!t.phone) {
        out.push({ contactId: t.id, name: t.name, ok: false, error: 'Sin teléfono registrado' })
      } else {
        try {
          const r = await fetch('/api/whatsapp/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contactId: t.id, template: selection.templateName, language: selection.language,
              headerImageUrl: selection.savedImageUrl || undefined, personalize: selection.personalize,
              bodyPreview: selection.bodyPreview,
            }),
          })
          const d = await r.json()
          out.push({ contactId: t.id, name: t.name, ok: r.ok && d.ok !== false, error: d.error })
        } catch {
          out.push({ contactId: t.id, name: t.name, ok: false, error: 'Error de red' })
        }
      }
      setDone(i + 1)
      setOutcomes([...out])
      if (!cancelRef.current && i < targets.length - 1) await wait(campaignDelayMs())
    }

    setPhase('results')
    return out
  }

  const cancel = () => { cancelRef.current = true }

  const reset = () => { setPhase('idle'); setTotal(0); setDone(0); setOutcomes([]); setFatalError('') }

  const sent   = outcomes.filter(o => o.ok).length
  const failed = outcomes.filter(o => !o.ok).length

  return { phase, total, done, outcomes, sent, failed, fatalError, askConfirm, backToForm, run, cancel, reset }
}

export function CampaignConfirmPanel({
  targetCount, selection, quota, onConfirm, onCancel,
}: {
  targetCount: number
  selection: WhatsAppTemplateSelection | null
  quota: CampaignQuota | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>¿Confirmas el envío?</div>
      <div style={{ padding: '12px 14px', background: 'var(--paper)', borderRadius: 10, fontSize: 13, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div>Plantilla: <strong>{selection?.templateName ?? '—'}</strong></div>
        <div>Contactos: <strong>{targetCount}</strong></div>
        <div>Tiempo estimado: <strong>{etaLabel(targetCount)}</strong> (pausa de ~3s entre cada uno)</div>
        {quota && <div>Cuota restante hoy: <strong>{quota.remaining}</strong> de {quota.limit}</div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
        Se enviará a los números reales de estos contactos. Esta acción no se puede deshacer.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={onConfirm}>Sí, enviar a {targetCount}</button>
      </div>
    </div>
  )
}

export function CampaignProgressPanel({ total, done, sent, failed }: { total: number; done: number; sent: number; failed: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Enviando campaña…</div>
      <div style={{ height: 10, background: 'var(--paper)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ipesa-orange)', borderRadius: 20, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12.5, color: 'var(--ink-2)' }}>
        <span>{done} de {total}</span>
        <span>{sent} enviados{failed > 0 ? ` · ${failed} fallidos` : ''}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
        No cierres esta ventana — se está enviando con una pausa entre cada mensaje para cuidar el número.
      </div>
    </div>
  )
}
