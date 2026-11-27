'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Clock, Plus, X } from 'lucide-react'
import { SiWhatsapp } from '@icons-pack/react-simple-icons'
import { apiFetch } from '@/lib/apiClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { LoadFailed } from '@/components/LoadFailed'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useWhatsAppCampaignQuota } from '@/components/WhatsAppCampaignQuota'
import type { CampaignSummary } from '@/lib/campaignKinds'
import type { CampaignPending } from '@/lib/campaignPending'
import { templateTitle } from '@/lib/campaignWizard'
import { bundleCampaigns, bundleLabel, type CampaignBundle } from '@/lib/campaignGroups'
import type { WizardStart } from './Wizard'
import { HomeListSkeleton } from './Skeletons'
import s from './campanas.module.css'

type Status = {
  config: { connected: boolean }
  health: { qualityRating?: string; canSendMessage?: string; healthNotes?: string[] } | null
}

const fmt = (n: number) => n.toLocaleString('es-MX')
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** «Hoy», «Ayer» o «18 nov» (con la hora si `time`). */
export function campaignWhen(iso: string, time = false): string {
  const d = new Date(iso)
  const now = new Date()
  const day = dayKey(d) === dayKey(now) ? 'Hoy'
    : dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000)) ? 'Ayer'
      : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) }).replace('.', '')
  return time ? `${day}, ${d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}` : day
}

/** «hoy», «ayer» o «el 18 nov» (para frases: «… llegaste al límite»). */
export function onDay(iso: string): string {
  const w = campaignWhen(iso)
  return w === 'Hoy' || w === 'Ayer' ? w.toLowerCase() : `el ${w}`
}

/** «a partir de las 3:20 p. m.» (hoy) o «a partir del 26 nov, 11:20 a. m.». */
export function fromTime(ms: number): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
  if (dayKey(d) === dayKey(new Date())) return `a partir de las ${time}`
  return `a partir del ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')}, ${time}`
}

/**
 * Inicio de Campañas: el botón para empezar, cuántas personas caben hoy, lo
 * que quedó pendiente y las campañas enviadas (al tocar una, sus resultados).
 */
export function CampaignHome({ onStart, onOpen }: { onStart: (start: WizardStart) => void; onOpen: (bundle: CampaignBundle) => void }) {
  const history = useCachedQuery<{ campaigns: CampaignSummary[] }>('/api/whatsapp/campaigns/history?days=90')
  const pendingQ = useCachedQuery<{ pending: CampaignPending[] }>('/api/whatsapp/campaigns/pending')
  const status = useCachedQuery<Status>('/api/whatsapp/status').data
  const { quota } = useWhatsAppCampaignQuota()
  const [discard, setDiscard] = useState<CampaignPending | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [discardError, setDiscardError] = useState('')

  // Un envío desde el chat (una sola persona) no es una campaña. Los envíos de la
  // misma plantilla en el mismo día (uno por segmento, por ejemplo) se ven juntos.
  const campaigns = useMemo(() => bundleCampaigns((history.data?.campaigns ?? []).filter(c => c.total > 1 || c.label)), [history.data])
  const pending = pendingQ.data?.pending[0] ?? null
  const notConnected = status ? !status.config.connected : false
  const blocked = status?.health?.canSendMessage === 'BLOCKED' || quota?.canSendMessage === 'BLOCKED'
  const notes = status?.health?.healthNotes ?? []
  const lowQuality = status?.health?.qualityRating === 'RED'
  // Meta limita el número por otra razón (p. ej. aún no aprueba su nombre visible)
  const limited = status?.health?.canSendMessage === 'LIMITED' && notes.length > 0
  const canStart = !notConnected && !blocked

  const doDiscard = async () => {
    if (!discard) return
    setDiscarding(true); setDiscardError('')
    try {
      const r = await apiFetch(`/api/whatsapp/campaigns/pending?campaignId=${discard.campaignId}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error)
      setDiscard(null)
    } catch (e) {
      setDiscardError((e as Error).message || 'No se pudo descartar. Intenta de nuevo.')
    } finally {
      setDiscarding(false)
    }
  }

  const newButton = (
    <button type="button" className={`btn btn-primary ${s.press}`} disabled={!canStart} onClick={() => onStart({ kind: 'new' })}>
      <Plus aria-hidden="true" /> Nueva campaña
    </button>
  )

  let banner: React.ReactNode = null
  if (notConnected) {
    banner = (
      <div className={s.banner}><Clock aria-hidden="true" /><div className={s.g}>
        <b>Falta conectar el WhatsApp de tu tienda</b>
        <span>En cuanto quede conectado podrás enviar campañas.</span>
      </div></div>
    )
  } else if (blocked) {
    banner = (
      <div className={`${s.banner} ${s.bad}`} role="alert"><AlertTriangle aria-hidden="true" /><div className={s.g}>
        <b>WhatsApp detuvo los envíos de tu número</b>
        <span>{notes.length ? notes.join(' ') : 'Revisa los avisos en el administrador de WhatsApp. Cuando se resuelva, podrás enviar.'}</span>
      </div></div>
    )
  } else if (pending) {
    const n = pending.contactIds.length
    banner = (
      <div className={s.banner}>
        <div className={s.g}>
          <b>{n === 1 ? 'Falta 1 persona' : `Faltan ${fmt(n)} personas`} por recibir «{templateTitle(pending.template)}»</b>
          <span>{[pending.label, `${onDay(pending.createdAt)} llegaste al límite del día`].filter(Boolean).join(' · ').replace(/^./, c => c.toUpperCase())}.</span>
        </div>
        <button type="button" className={`btn btn-primary ${s.press}`} onClick={() => onStart({ kind: 'pending', pending })}>{n === 1 ? 'Enviar a 1' : `Enviar a los ${fmt(n)}`}</button>
        <button type="button" className={s.x} aria-label="Descartar lo pendiente" title="Descartar" onClick={() => { setDiscardError(''); setDiscard(pending) }}><X aria-hidden="true" /></button>
      </div>
    )
  } else if (lowQuality) {
    banner = (
      <div className={`${s.banner} ${s.warn}`}><AlertTriangle aria-hidden="true" /><div className={s.g}>
        <b>WhatsApp avisa que la calidad de tu número es baja</b>
        <span>Algunos clientes bloquearon o reportaron tus mensajes. Envía solo a quien aceptó recibirlos; si sigue así, WhatsApp puede pausar tus plantillas.</span>
      </div></div>
    )
  } else if (limited) {
    banner = (
      <div className={`${s.banner} ${s.warn}`}><AlertTriangle aria-hidden="true" /><div className={s.g}>
        <b>WhatsApp limita tu número por ahora</b>
        <span>{notes.join(' ')}</span>
      </div></div>
    )
  }

  const loading = history.loading
  const empty = !loading && !history.error && !campaigns.length && !pending

  return (
    <>
      <div className={s.head}>
        <h2>Campañas</h2>
        {!empty && newButton}
      </div>

      {banner}
      {quota && quota.remaining !== null && canStart && !empty && (
        <p className={s.quota}>Hoy puedes escribirle a {quota.remaining === 1 ? '1 persona' : `${fmt(quota.remaining)} personas`}.</p>
      )}

      {loading ? (
        <HomeListSkeleton />
      ) : history.error && !history.data ? (
        <LoadFailed message={history.error.message || 'No se pudieron cargar tus campañas'} onRetry={history.reload} />
      ) : empty ? (
        <div className={s.zero}>
          <span className={s.wi}><SiWhatsapp aria-hidden="true" /></span>
          <h3>Un mismo mensaje para muchos clientes</h3>
          <p>Elige a quién, elige la plantilla y envía. Nada sale hasta que lo confirmes.</p>
          {newButton}
        </div>
      ) : (
        <>
          <div className={s.list}>
            <div className={s.lh} aria-hidden="true"><span>Campaña</span><span>Enviadas</span><span>Leídas</span><span>Respondieron</span><span /></div>
            {campaigns.map(c => {
              const sent = c.total - c.failed
              return (
                <button key={c.key} type="button" className={s.lr} onClick={() => onOpen(c)}>
                  <span style={{ minWidth: 0 }}>
                    <b>{templateTitle(c.template)}</b>
                    <small>{[bundleLabel(c.labels), campaignWhen(c.startedAt)].filter(Boolean).join(' · ')}</small>
                    <small className={s.ms}>{fmt(c.replied)} de {fmt(sent)} respondieron</small>
                  </span>
                  <span className={s.num} aria-label={`${fmt(sent)} enviadas`}>{fmt(sent)}</span>
                  <span className={s.num} aria-label={`${fmt(c.seen)} leídas`}>{fmt(c.seen)}</span>
                  <span className={`${s.num} ${s.r}`} aria-label={`${fmt(c.replied)} respondieron`}>{fmt(c.replied)}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )
            })}
          </div>
          {!campaigns.length && <p className={s.more}>Aún no hay campañas en los últimos 90 días.</p>}
          {campaigns.length > 0 && <p className={s.more}>Campañas de los últimos 90 días.</p>}
        </>
      )}

      <ConfirmDialog open={!!discard} title="¿Descartar lo pendiente?" confirmLabel="Descartar" busyLabel="Descartando…" busy={discarding}
        error={discardError} onConfirm={() => void doDiscard()} onCancel={() => setDiscard(null)}>
        {discard && `${discard.contactIds.length === 1 ? 'A esa persona' : `A esas ${fmt(discard.contactIds.length)} personas`} ya no se les enviará «${templateTitle(discard.template)}».`}
      </ConfirmDialog>
    </>
  )
}
