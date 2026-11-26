'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { LoadFailed } from '@/components/LoadFailed'
import { fmtPhone } from '@/lib/phone'
import { downloadCampaignWorkbook } from '@/lib/exportData'
import { FAILURE_KINDS, type CampaignDetail, type CampaignRecipient, type CampaignSummary, type FailureKind } from '@/lib/campaignKinds'
import { MARKETING_RETRY_HOURS } from '@/lib/whatsappSafety'
import { segmentOf, templateTitle } from '@/lib/campaignWizard'
import { ResultSkeleton } from './Skeletons'
import { campaignWhen, fromTime } from './Home'
import s from './campanas.module.css'

type Tab = 'r' | 'l' | 'n' | 'f'
const fmt = (n: number) => n.toLocaleString('es-MX')
const PAGE = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Por qué no le llegó, en pocas palabras. */
const FAIL_SHORT: Record<FailureKind, string> = {
  no_whatsapp: 'No tiene WhatsApp',
  marketing_limit: 'WhatsApp pidió esperar antes de mandarle otra',
  opt_out: 'Pidió no recibir mensajes',
  rate_limit: 'WhatsApp pidió esperar entre envíos',
  quality: 'WhatsApp restringió el número',
  template: 'Problema con la plantilla',
  token: 'Se venció la conexión con WhatsApp',
  other: 'No se pudo entregar',
}

/**
 * Un motivo sin clasificar: el texto guardado si está en español; si WhatsApp
 * lo mandó en inglés, en palabras sencillas.
 */
function otherReason(error: string | null): string {
  if (!error) return FAIL_SHORT.other
  if (/experiment/i.test(error)) return 'WhatsApp no se lo entregó: su número está en una prueba de WhatsApp'
  if (/\b(failed|message|user|unable|the|not)\b/i.test(error) && !/[áéíóúñ¿]/i.test(error)) return FAIL_SHORT.other
  return error
}

const tabOf = (r: CampaignRecipient): Tab => (r.bucket === 'failed' ? 'f' : r.replied ? 'r' : r.bucket === 'read' ? 'l' : 'n')
const holdEnds = (r: CampaignRecipient) => new Date(r.updatedAt).getTime() + MARKETING_RETRY_HOURS * 3_600_000

/** Lo que se le vuelve a mandar desde Resultados (se revisa y confirma en el paso 3). */
export type CampaignRetry = { template: string; contactIds: string[]; campaignId: string | null; label: string | null }

/**
 * Resultados de una campaña: enviadas, leídas y respondieron; quién está en
 * cada caso y, de lo que no llegó, lo que se puede reintentar. `id` es el de
 * la campaña o solo el de su envío (al terminar de enviar).
 */
export function CampaignResult({ id, onBack, onRetry, onOpenChat }: {
  id: string
  onBack: () => void
  onRetry: (r: CampaignRetry) => void
  onOpenChat: (phone: string) => void
}) {
  // Recién enviada solo se conoce el id del envío: se busca en la lista
  const bySend = UUID.test(id)
  const list = useCachedQuery<{ campaigns: CampaignSummary[] }>(bySend ? '/api/whatsapp/campaigns/history?days=90' : null)
  const fullId = bySend ? list.data?.campaigns.find(c => c.id.endsWith(`.${id}`))?.id ?? null : id
  const { data, error, reload } = useCachedQuery<{ campaign: CampaignDetail }>(fullId ? `/api/whatsapp/campaigns/history/${encodeURIComponent(fullId)}` : null)
  const c = data?.campaign

  const [only, setOnly] = useState('')
  const [tab, setTab] = useState<Tab | null>(null)
  const [shown, setShown] = useState(PAGE)
  useEffect(() => { setShown(PAGE) }, [tab, only])

  // Mientras WhatsApp confirma entregas y lecturas, se actualiza solo (la primera hora)
  const live = !!c && c.pending > 0 && Date.now() - new Date(c.endedAt).getTime() < 3_600_000
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => { void reload() }, 20_000)
    return () => clearInterval(t)
  }, [live, reload])

  const groups = useMemo(() => [...new Set((c?.recipients ?? []).map(segmentOf))], [c])
  const people = useMemo(() => (c?.recipients ?? []).filter(r => !only || segmentOf(r) === only), [c, only])
  const counts = useMemo(() => {
    const m: Record<Tab, number> = { r: 0, l: 0, n: 0, f: 0 }
    for (const r of people) m[tabOf(r)]++
    return m
  }, [people])

  const back = (
    <button type="button" className={s.back} onClick={onBack} aria-label="Volver a Campañas"><ArrowLeft aria-hidden="true" /></button>
  )
  if (error && !c) return <><div className={s.rhead}>{back}</div><LoadFailed message={error.message || 'No se pudo cargar la campaña'} onRetry={reload} /></>
  if (bySend && list.data && !fullId) return <><div className={s.rhead}>{back}</div><LoadFailed message="Aún no aparece esta campaña. Intenta en unos segundos." onRetry={() => void list.reload()} /></>
  if (!c) return <ResultSkeleton />

  const active: Tab = tab ?? (counts.r ? 'r' : 'n')
  const sent = people.length - counts.f
  const seen = counts.r + counts.l
  const rows = people.filter(r => tabOf(r) === active)
  const TABS: [Tab, string][] = [['r', 'Respondieron'], ['l', 'Leyeron'], ['n', 'Sin leer'], ['f', 'No llegó']]

  // Lo que vale la pena reintentar (límites temporales de WhatsApp), quien no lo recibió después
  const now = Date.now()
  const retryable = active === 'f' ? rows.filter(r => r.kind && FAILURE_KINDS[r.kind].retry && r.contactId && !r.receivedLater) : []
  const ready = retryable.filter(r => r.kind !== 'marketing_limit' || holdEnds(r) <= now)
  const waitUntil = ready.length < retryable.length ? Math.max(...retryable.filter(r => !ready.includes(r)).map(holdEnds)) : 0
  const sendId = c.id.split('.')[2] ?? null

  const subOf = (r: CampaignRecipient) => {
    if (active === 'r') return r.reply ? `«${r.reply}»` : 'Respondió'
    if (active === 'l') return 'Leyó el mensaje'
    if (active === 'n') return r.bucket === 'delivered' ? 'Le llegó, no lo ha abierto' : 'Enviado; WhatsApp aún no confirma que le llegó'
    return r.kind === 'other' ? otherReason(r.error) : FAIL_SHORT[r.kind ?? 'other']
  }

  return (
    <>
      <div className={s.rhead}>
        {back}
        <div>
          <h2>{templateTitle(c.template)}</h2>
          <p>{[c.label, campaignWhen(c.startedAt, true)].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      {groups.length > 1 && (
        <div className={s.gseg} role="group" aria-label="Grupo">
          {['', ...groups].map(g => (
            <button key={g || 'todos'} type="button" className={s.press} aria-pressed={only === g} onClick={() => setOnly(g)}>{g || 'Todos'}</button>
          ))}
        </div>
      )}

      <div className={s.trio}>
        <div><b>{fmt(sent)}</b><span>enviadas</span></div>
        <div><b>{fmt(seen)}</b><span>leídas</span></div>
        <div><b>{fmt(counts.r)}</b><span>respondieron</span></div>
      </div>

      <div className={s.tabs} role="tablist" aria-label="Quién">
        {TABS.map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={active === k} onClick={() => setTab(k)}>{name} {fmt(counts[k])}</button>
        ))}
      </div>

      <div role="tabpanel">
        {retryable.length > 0 && (
          <div className={`${s.pr} ${s.retry}`}>
            <div className={s.g}>
              <b>{ready.length ? (ready.length === 1 ? 'Uno se puede reintentar' : `${fmt(ready.length)} se pueden reintentar`) : (retryable.length === 1 ? 'Uno se podrá reintentar' : `${fmt(retryable.length)} se podrán reintentar`)}</b>
              <small>{ready.length ? 'Fue un límite temporal de WhatsApp.' : `WhatsApp pidió esperar; podrás hacerlo ${fromTime(waitUntil)}.`}</small>
            </div>
            {ready.length > 0 && (
              <button type="button" className={`btn btn-ghost ${s.press}`}
                onClick={() => onRetry({ template: c.template, contactIds: ready.map(r => r.contactId!), campaignId: sendId, label: c.label })}>
                Reintentar
              </button>
            )}
          </div>
        )}
        {rows.length === 0 ? (
          <p className={s.mut} style={{ padding: '22px 2px' }}>Nadie por ahora.</p>
        ) : rows.slice(0, shown).map(r => (
          <div key={r.phone} className={s.pr}>
            <div className={s.g}>
              <b>{r.name || fmtPhone(r.phone)}</b>
              <small>{subOf(r)}</small>
            </div>
            {active !== 'f' && <button type="button" className={s.lk} onClick={() => onOpenChat(r.phone)}>Abrir chat</button>}
          </div>
        ))}
        {rows.length > shown && (
          <p className={s.more}><button type="button" className={s.lk} onClick={() => setShown(n => n + PAGE)}>Ver {fmt(Math.min(PAGE, rows.length - shown))} más</button></p>
        )}
      </div>

      <div className={s.foot}>
        <span className={s.mut}>{live ? 'WhatsApp sigue confirmando entregas; esto se actualiza solo.' : ''}</span>
        <button type="button" className={s.lk} onClick={() => void downloadCampaignWorkbook(c)}><Download aria-hidden="true" />Descargar Excel</button>
      </div>
    </>
  )
}
