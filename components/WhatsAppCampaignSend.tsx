'use client'

import { useRef, useState } from 'react'
import { CAMPAIGN_BATCH_SIZE, campaignEtaLabel } from '@/lib/whatsappSafety'
import type { WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import type { CampaignQuota } from '@/components/WhatsAppCampaignQuota'

export type CampaignTarget = { id: string; name: string; phone: string | null }
export type CampaignOutcome = { contactId: string; name: string; ok: boolean; skipped?: boolean; held?: boolean; error?: string }
export type CampaignPhase = 'idle' | 'confirm' | 'sending' | 'results'

type BatchResult = { contactId?: string; ok: boolean; skipped?: boolean; held?: boolean; error?: string; note?: string }

/**
 * Orquesta confirmar → enviar → resultados (Contactos y WhatsApp › Campañas).
 * Se manda por lotes: el servidor envía cada lote con poca concurrencia,
 * dentro de los límites de velocidad de Meta, sin pausas artificiales.
 */
export function useCampaignSend() {
  const [phase, setPhase]       = useState<CampaignPhase>('idle')
  const [total, setTotal]       = useState(0)
  const [done, setDone]         = useState(0)
  const [outcomes, setOutcomes] = useState<CampaignOutcome[]>([])
  const [stopReason, setStopReason] = useState('')
  const cancelRef = useRef(false)

  const askConfirm = () => setPhase('confirm')
  const backToForm = () => setPhase('idle')

  const run = async (targets: CampaignTarget[], selection: WhatsAppTemplateSelection) => {
    cancelRef.current = false
    setPhase('sending'); setTotal(targets.length); setDone(0); setOutcomes([]); setStopReason('')
    const out: CampaignOutcome[] = []
    const nameOf = new Map(targets.map(t => [t.id, t.name]))

    for (const t of targets) {
      if (!t.phone) out.push({ contactId: t.id, name: t.name, ok: false, skipped: true, error: 'Sin teléfono registrado' })
    }
    const sendable = targets.filter(t => t.phone)
    setDone(out.length); setOutcomes([...out])

    for (let i = 0; i < sendable.length; i += CAMPAIGN_BATCH_SIZE) {
      if (cancelRef.current) { setStopReason('Envío detenido por ti. Los contactos restantes no recibieron nada.'); break }
      const batch = sendable.slice(i, i + CAMPAIGN_BATCH_SIZE)
      let stop = ''
      try {
        const r = await fetch('/api/whatsapp/campaigns/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: batch.map(t => ({ contactId: t.id })),
            template: selection.templateName, language: selection.language, category: selection.category,
            headerImageUrl: selection.savedImageUrl || undefined, personalize: selection.personalize,
            bodyPreview: selection.bodyPreview, bodyParams: selection.bodyParams,
          }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) {
          stop = d.error || 'No se pudo enviar el lote.'
        } else {
          for (const o of (d.results ?? []) as BatchResult[]) {
            const id = o.contactId ?? ''
            out.push({ contactId: id, name: nameOf.get(id) ?? '', ok: o.ok, skipped: !!o.skipped, held: !!o.held, error: o.error ?? (o.held ? o.note : undefined) })
          }
          stop = d.stop || ''
        }
      } catch {
        stop = 'Error de red: revisa tu conexión. Los contactos restantes no recibieron nada.'
      }
      setDone(out.length); setOutcomes([...out])
      if (stop) { setStopReason(stop); break }
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
        {quota && <div><span>Límite de Meta hoy</span><strong>{quota.remaining === null ? 'Sin límite' : `${quota.remaining.toLocaleString('es-MX')} de ${(quota.limit ?? 0).toLocaleString('es-MX')} personas`}</strong></div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
        Se enviará a los números reales de estos contactos, respetando los límites de velocidad de Meta. Esta acción no se puede deshacer.
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
        No cierres esta pestaña hasta que termine el envío.
      </div>
      {onCancel && <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={onCancel}>Detener envío</button>}
    </div>
  )
}

export function CampaignResultsPanel({ sent, skipped, failed, outcomes, stopReason, onDone, doneLabel = 'Listo', onViewResults }: {
  sent: number; skipped: number; failed: number; outcomes: CampaignOutcome[]; stopReason?: string; onDone: () => void; doneLabel?: string
  /** Botón "Ver en Resultados" (solo en WhatsApp › Campañas). */
  onViewResults?: () => void
}) {
  const problems = outcomes.filter(o => !o.ok)
  const held = outcomes.filter(o => o.ok && o.held).length
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Resultado del envío</div>
      <div className="wa-result-grid">
        <div className="ok"><strong>{sent}</strong><span>enviados</span></div>
        <div className={skipped ? 'warn' : ''}><strong>{skipped}</strong><span>omitidos</span></div>
        <div className={failed ? 'bad' : ''}><strong>{failed}</strong><span>fallidos</span></div>
      </div>
      {stopReason && <div className="wa-warn" style={{ marginTop: 12 }}>{stopReason}</div>}
      {held > 0 && (
        <div className="wa-muted-box" style={{ marginTop: 12 }}>
          {held === 1 ? '1 mensaje quedó retenido' : `${held} mensajes quedaron retenidos`} por Meta para evaluar la calidad de la plantilla. Meta los entrega en cuanto termina (normalmente en menos de una hora); si la plantilla recibe malas reacciones, la pausa y no se entregan.
        </div>
      )}
      {problems.length > 0 && (
        <div className="wa-problems">
          {problems.map((o, i) => (
            <div key={i}><strong>{o.name || 'Contacto'}</strong>: <span className={o.skipped ? 'skip' : 'err'}>{o.error}</span></div>
          ))}
        </div>
      )}
      {onViewResults ? (
        <>
          {sent > 0 && (
            <div className="wa-muted-box" style={{ marginTop: 12 }}>
              Meta confirma la entrega en los minutos siguientes. En Resultados verás quién lo recibió, quién lo leyó y a quién no le llegó (y por qué).
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={onViewResults}>Ver en Resultados</button>
            <button className="btn btn-ghost" onClick={onDone}>{doneLabel}</button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onDone}>{doneLabel}</button>
      )}
    </div>
  )
}
