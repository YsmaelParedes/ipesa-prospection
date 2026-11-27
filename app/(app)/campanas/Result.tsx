'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { LoadFailed } from '@/components/LoadFailed'
import { fmtPhone } from '@/lib/phone'
import { downloadCampaignWorkbook, downloadCampaignsWorkbook } from '@/lib/exportData'
import { FAILURE_KINDS, type CampaignDetail, type CampaignRecipient, type CampaignSummary, type FailureKind } from '@/lib/campaignKinds'
import { MARKETING_RETRY_HOURS } from '@/lib/whatsappSafety'
import { segmentOf, templateTitle } from '@/lib/campaignWizard'
import { bundleCampaigns, localDay, mergeDetails, type GroupedRecipient } from '@/lib/campaignGroups'
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

/** El detalle de cada envío (uno o varios), con su forma de volver a pedirlos. */
function useDetails(ids: string[] | null) {
  const [details, setDetails] = useState<CampaignDetail[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  const key = ids?.join(',') ?? ''
  useEffect(() => {
    if (!key) return
    let alive = true
    const fresh = tick > 0
    // Otra campaña: no se muestra la anterior mientras llega
    if (!fresh) setDetails(null)
    Promise.all(key.split(',').map(async id => {
      const r = await apiFetch(`/api/whatsapp/campaigns/history/${encodeURIComponent(id)}`, fresh ? { cache: 'reload' } : undefined)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar la campaña')
      return d.campaign as CampaignDetail
    })).then(list => { if (alive) { setDetails(list); setError(null) } })
      .catch(e => { if (alive) setError(e as Error) })
    return () => { alive = false }
  }, [key, tick])
  const reload = useCallback(() => setTick(t => t + 1), [])
  return { details, error, reload }
}

/**
 * Resultados de una campaña: enviadas, leídas y respondieron; quién está en
 * cada caso y, de lo que no llegó, lo que se puede reintentar.
 *  · id: un envío (o solo el id de su envío, al terminar de enviar)
 *  · group: la campaña junta (misma plantilla, mismo día: `plantilla|AAAA-MM-DD`)
 */
export function CampaignResult({ id, group, onBack, onRetry, onOpenChat }: {
  id?: string | null
  group?: string | null
  onBack: () => void
  onRetry: (r: CampaignRetry) => void
  onOpenChat: (phone: string) => void
}) {
  // Recién enviada solo se conoce el id del envío; la campaña junta se arma con la lista
  const bySend = !!id && UUID.test(id)
  const list = useCachedQuery<{ campaigns: CampaignSummary[] }>(bySend || group ? '/api/whatsapp/campaigns/history?days=90' : null)
  const ids = useMemo(() => {
    if (group) return list.data ? bundleCampaigns(list.data.campaigns).find(b => b.key === group)?.ids ?? [] : null
    if (bySend) return list.data ? [list.data.campaigns.find(c => c.id.endsWith(`.${id}`))?.id].filter((x): x is string => !!x) : null
    return id ? [id] : []
  }, [group, bySend, id, list.data])
  const { details, error, reload } = useDetails(ids && ids.length ? ids : null)
  const c = useMemo(() => (details ? mergeDetails(details) : undefined), [details])
  // Juntos, cada quien es del grupo del envío en que le llegó; uno solo, de su segmento
  const groupOf = useCallback((r: GroupedRecipient) => (details && details.length > 1 ? r.sendLabel?.trim() || segmentOf(r) : segmentOf(r)), [details])

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

  const groups = useMemo(() => [...new Set((c?.recipients ?? []).map(groupOf))], [c, groupOf])
  const people = useMemo(() => (c?.recipients ?? []).filter(r => !only || groupOf(r) === only), [c, only, groupOf])
  const counts = useMemo(() => {
    const m: Record<Tab, number> = { r: 0, l: 0, n: 0, f: 0 }
    for (const r of people) m[tabOf(r)]++
    return m
  }, [people])

  const back = (
    <button type="button" className={s.back} onClick={onBack} aria-label="Volver a Campañas"><ArrowLeft aria-hidden="true" /></button>
  )
  if (error && !c) return <><div className={s.rhead}>{back}</div><LoadFailed message={error.message || 'No se pudo cargar la campaña'} onRetry={reload} /></>
  if (ids && !ids.length) return <><div className={s.rhead}>{back}</div><LoadFailed message="Aún no aparece esta campaña. Intenta en unos segundos." onRetry={() => void list.reload()} /></>
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
  // Un reintento sigue el mismo envío; de varios envíos juntos, es uno nuevo
  const sendId = details && details.length === 1 ? c.id.split('.')[2] ?? null : null

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
        <button type="button" className={s.lk}
          onClick={() => void (details && details.length > 1 ? downloadCampaignsWorkbook(details, `${c.template}-${localDay(c.startedAt)}`) : downloadCampaignWorkbook(c))}>
          <Download aria-hidden="true" />Descargar Excel
        </button>
      </div>
    </>
  )
}
