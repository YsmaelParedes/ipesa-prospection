'use client'

import { useRef, useState } from 'react'
import { campaignDelayMs, campaignEtaLabel, wait } from '@/lib/whatsappSafety'
import type { WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import type { CampaignQuota } from '@/components/WhatsAppCampaignQuota'

export type CampaignTarget = { id: string; name: string; phone: string | null }
export type CampaignOutcome = { contactId: string; name: string; ok: boolean; skipped?: boolean; error?: string }
export type CampaignPhase = 'idle' | 'confirm' | 'sending' | 'results'

/** Orquesta confirmar → enviar uno por uno con pausa → resultados (Contactos y WhatsApp › Campañas). */
export function useCampaignSend() {
  const [phase, setPhase]       = useState<CampaignPhase>('idle')
  const [total, setTotal]       = useState(0)
  const [done, setDone]         = useState(0)
  const [outcomes, setOutcomes] = useState<CampaignOutcome[]>([])
  const [stopReason, setStopReason] = useState('')
  const cancelRef = useRef(false)

  const askConfirm = () => setPhase('confirm')
  const backToForm = () => setPhase('idle')

  const run = async (targets: CampaignTarget[], selection: WhatsAppTemplateSelection, { skipRecent = true } = {}) => {
    cancelRef.current = false
    setPhase('sending'); setTotal(targets.length); setDone(0); setOutcomes([]); setStopReason('')
    const out: CampaignOutcome[] = []

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) { setStopReason('Envío detenido por ti. Los contactos restantes no recibieron nada.'); break }
      const t = targets[i]
      let sentToMeta = false
      if (!t.phone) {
        out.push({ contactId: t.id, name: t.name, ok: false, skipped: true, error: 'Sin teléfono registrado' })
      } else {
        try {
          const r = await fetch('/api/whatsapp/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contactId: t.id, template: selection.templateName, language: selection.language,
              headerImageUrl: selection.savedImageUrl || undefined, personalize: selection.personalize,
              bodyPreview: selection.bodyPreview, bodyParams: selection.bodyParams, skipRecent,
            }),
          })
          const d = await r.json().catch(() => ({}))
          if (r.status === 429) {
            // Tope diario alcanzado: no tiene caso seguir intentando
            out.push({ contactId: t.id, name: t.name, ok: false, error: d.error })
            setStopReason(d.error || 'Se alcanzó el límite diario de envíos.')
            setDone(i + 1); setOutcomes([...out])
            break
          }
          sentToMeta = r.ok && !d.skipped
          out.push({ contactId: t.id, name: t.name, ok: r.ok && d.ok !== false, skipped: !!d.skipped, error: d.error })
        } catch {
          out.push({ contactId: t.id, name: t.name, ok: false, error: 'Error de red' })
        }
      }
      setDone(i + 1)
      setOutcomes([...out])
      // La pausa solo aplica si de verdad se envió algo a Meta
      if (sentToMeta && !cancelRef.current && i < targets.length - 1) await wait(campaignDelayMs())
    }

    setPhase('results')
    return out
  }

  const cancel = () => { cancelRef.current = true }
  const reset = () => { setPhase('idle'); setTotal(0); setDone(0); setOutcomes([]); setStopReason('') }

  const sent    = outcomes.filter(o => o.ok).length
  const skipped = outcomes.filter(o => !o.ok && o.skipped).length
  const failed  = outcomes.filter(o => !o.ok && !o.skipped).length

  return { phase, total, done, outcomes, sent, skipped, failed, stopReason, askConfirm, backToForm, run, cancel, reset }
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
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>¿Confirmas el envío?</div>
      <div className="wa-summary">
        <div><span>Plantilla</span><strong>{selection?.templateName.replace(/_/g, ' ') ?? '—'}</strong></div>
        <div><span>Contactos</span><strong>{targetCount}</strong></div>
        <div><span>Tiempo estimado</span><strong>{campaignEtaLabel(targetCount)}</strong></div>
        {quota && <div><span>Cuota restante hoy</span><strong>{quota.remaining} de {quota.limit}</strong></div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
        Se enviará a los números reales de estos contactos, con una pausa de ~3 s entre cada uno para cuidar la calidad del número. Esta acción no se puede deshacer.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={onConfirm}>Sí, enviar a {targetCount}</button>
      </div>
    </div>
  )
}

export function CampaignProgressPanel({ total, done, sent, failed, skipped, onCancel }: {
  total: number; done: number; sent: number; failed: number; skipped: number; onCancel?: () => void
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Enviando campaña… {pct}%</div>
      <div className="wa-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12.5, color: 'var(--ink-2)', gap: 10, flexWrap: 'wrap' }}>
        <span>{done} de {total}</span>
        <span>{sent} enviados{skipped ? ` · ${skipped} omitidos` : ''}{failed ? ` · ${failed} fallidos` : ''}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
        No cierres esta pestaña — se envía con una pausa entre cada mensaje para cuidar el número.
      </div>
      {onCancel && <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={onCancel}>Detener envío</button>}
    </div>
  )
}

export function CampaignResultsPanel({ sent, skipped, failed, outcomes, stopReason, onDone, doneLabel = 'Listo' }: {
  sent: number; skipped: number; failed: number; outcomes: CampaignOutcome[]; stopReason?: string; onDone: () => void; doneLabel?: string
}) {
  const problems = outcomes.filter(o => !o.ok)
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Resultado del envío</div>
      <div className="wa-result-grid">
        <div className="ok"><strong>{sent}</strong><span>enviados</span></div>
        <div className={skipped ? 'warn' : ''}><strong>{skipped}</strong><span>omitidos</span></div>
        <div className={failed ? 'bad' : ''}><strong>{failed}</strong><span>fallidos</span></div>
      </div>
      {stopReason && <div className="wa-warn" style={{ marginTop: 12 }}>{stopReason}</div>}
      {problems.length > 0 && (
        <div className="wa-problems">
          {problems.map((o, i) => (
            <div key={i}><strong>{o.name || 'Contacto'}</strong>: <span className={o.skipped ? 'skip' : 'err'}>{o.error}</span></div>
          ))}
        </div>
      )}
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onDone}>{doneLabel}</button>
    </div>
  )
}
