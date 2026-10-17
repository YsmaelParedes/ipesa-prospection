'use client'

import { useQueryEffect } from '@/lib/useCachedQuery'


import { apiFetch } from '@/lib/apiClient'


import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Avatar, TipoChip } from '@/components/CrmUI'
import { WaIcon } from '@/components/WhatsAppUI'
import { fmtPhone } from '@/lib/phone'
import { csvStamp, downloadCsv } from '@/lib/csv'
import { WhatsAppCampaignPeople } from '@/components/WhatsAppCampaignPeople'
import {
  FAILURE_KINDS, type CampaignBucket, type CampaignDetail, type CampaignRecipient, type CampaignSummary, type FailureKind,
} from '@/lib/campaignKinds'

/** Contactos a los que se vuelve a mandar una plantilla (se preseleccionan en la pestaña Campañas). */
export type CampaignRetry = { template: string; contactIds: string[]; label: string }

type Counts = Pick<CampaignSummary, 'total' | 'read' | 'delivered' | 'pending' | 'failed' | 'replied'>
type Filter = 'all' | CampaignBucket | 'replied'

const BUCKET_LABEL: Record<CampaignBucket, string> = { read: 'Leído', delivered: 'Entregado', pending: 'Pendiente', failed: 'No entregado' }
const BUCKET_ORDER: Record<CampaignBucket, number> = { failed: 0, pending: 1, delivered: 2, read: 3 }
const PAGE = 100

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const tplName = (t: string) => t.replace(/_/g, ' ')
const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

function duration(a: string, b: string) {
  const min = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)
  return min < 1 ? 'menos de 1 min' : `${min} min`
}

/** Barra de estados: leídos, entregados, pendientes y no entregados. */
function StatusBar({ s }: { s: Counts }) {
  const parts: [CampaignBucket, number][] = [['read', s.read], ['delivered', s.delivered], ['pending', s.pending], ['failed', s.failed]]
  return (
    <div className="wa-bar" role="img"
      aria-label={`${s.read} leídos, ${s.delivered} entregados, ${s.pending} pendientes y ${s.failed} no entregados`}>
      {parts.map(([k, n]) => n > 0 && <span key={k} className={k} style={{ flexGrow: n }} />)}
    </div>
  )
}

function Legend() {
  return (
    <div className="wa-legend">
      <span><i style={{ background: '#1E9E5A' }} />Leído</span>
      <span><i style={{ background: '#9AD8B0' }} />Entregado</span>
      <span><i style={{ background: '#C9C9C6' }} />Pendiente</span>
      <span><i style={{ background: 'var(--danger)' }} />No entregado</span>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <div className={`wa-kpi ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Resultados: historial por campaña → detalle de una campaña
══════════════════════════════════════════════════════════════════════════ */
export function WhatsAppCampaignResults({ onRetry, onOpenChat }: {
  onRetry: (retry: CampaignRetry) => void
  onOpenChat: (phone: string) => void
}) {
  const [view, setView]     = useState<'campaigns' | 'people'>('campaigns')
  const [days, setDays]     = useState(30)
  const [list, setList]     = useState<CampaignSummary[] | null>(null)
  const [error, setError]   = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useQueryEffect(() => {
    let cancelled = false
    setError('')
    apiFetch(`/api/whatsapp/campaigns/history?days=${days}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => { if (!cancelled) setList(d.campaigns ?? []) })
      .catch(e => { if (!cancelled) setError(e?.message || 'No se pudo cargar el historial de campañas') })
    return () => { cancelled = true }
  }, [days])

  const totals = useMemo(() => (list ?? []).reduce<Counts>(
    (a, c) => ({ total: a.total + c.total, read: a.read + c.read, delivered: a.delivered + c.delivered, pending: a.pending + c.pending, failed: a.failed + c.failed, replied: a.replied + c.replied }),
    { total: 0, read: 0, delivered: 0, pending: 0, failed: 0, replied: 0 },
  ), [list])

  if (openId) return <CampaignDetailView id={openId} onBack={() => setOpenId(null)} onRetry={onRetry} onOpenChat={onOpenChat} />

  const viewSwitch = (
    <div className="wa-seg wa-view-seg" role="tablist" aria-label="Ver resultados">
      <button role="tab" aria-selected={view === 'campaigns'} className={view === 'campaigns' ? 'active' : ''} onClick={() => setView('campaigns')}>
        <WaIcon.megaphone size={14} /> Por campaña
      </button>
      <button role="tab" aria-selected={view === 'people'} className={view === 'people' ? 'active' : ''} onClick={() => setView('people')}>
        <WaIcon.user size={14} /> Por persona
      </button>
    </div>
  )

  if (view === 'people') {
    return <div className="wa-scroll">{viewSwitch}<WhatsAppCampaignPeople onOpenChat={onOpenChat} /></div>
  }

  const reached = totals.read + totals.delivered
  return (
    <div className="wa-scroll">
      {viewSwitch}
      <div className="wa-results-head">
        <div>
          <div className="wa-results-title">Resultados de campañas</div>
          <div className="wa-results-sub">Cada envío por separado: quién recibió el mensaje y a quién no le llegó</div>
        </div>
        <div className="wa-seg">
          {[7, 30, 90].map(d => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} días</button>)}
        </div>
      </div>

      {error ? (
        <div className="wa-card wa-empty small"><WaIcon.alert size={20} />{error}</div>
      ) : !list ? (
        <div className="wa-card wa-empty small"><span className="wa-spinner" /></div>
      ) : list.length === 0 ? (
        <div className="wa-card wa-empty small"><WaIcon.chart size={26} /> No se han enviado campañas en este periodo.</div>
      ) : (
        <>
          <div className="wa-kpis">
            <Kpi label="Destinatarios" value={totals.total} sub={plural(list.length, 'campaña', 'campañas')} />
            <Kpi label="Entregados o leídos" value={`${pct(reached, totals.total)}%`} sub={`${reached} de ${totals.total}`} />
            <Kpi label="Leídos" value={`${pct(totals.read, totals.total)}%`} sub={plural(totals.read, 'mensaje', 'mensajes')} />
            <Kpi label="Respondieron" value={`${pct(totals.replied, totals.total)}%`} sub={plural(totals.replied, 'persona', 'personas')} tone="good" />
            <Kpi label="No entregados" value={totals.failed} sub={totals.pending ? `${totals.pending} aún pendientes` : undefined} tone={totals.failed ? 'bad' : undefined} />
          </div>

          <Legend />

          <div className="wa-camp-list">
            {list.map(c => (
              <button key={c.id} className="wa-card wa-camp-card" onClick={() => setOpenId(c.id)}>
                <div className="wa-camp-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="wa-camp-name">{tplName(c.template)}</div>
                    <div className="wa-camp-sub">{when(c.startedAt)} · {c.total === 1 ? 'envío individual' : plural(c.total, 'destinatario', 'destinatarios')}</div>
                  </div>
                  <span className={`wa-camp-tag ${c.failed ? 'bad' : c.pending ? 'warn' : 'ok'}`}>
                    {c.failed ? plural(c.failed, 'no entregado', 'no entregados') : c.pending ? plural(c.pending, 'pendiente', 'pendientes') : 'Todo entregado'}
                  </span>
                </div>
                <StatusBar s={c} />
                <div className="wa-camp-nums">
                  <span>{plural(c.read, 'leído', 'leídos')}</span>
                  <span>{plural(c.delivered, 'entregado', 'entregados')}</span>
                  {c.pending > 0 && <span>{plural(c.pending, 'pendiente', 'pendientes')}</span>}
                  {c.failed > 0 && <span className="bad">{plural(c.failed, 'no entregado', 'no entregados')}</span>}
                  <span className="good">{c.replied === 1 ? '1 respondió' : `${c.replied} respondieron`}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Detalle de una campaña
══════════════════════════════════════════════════════════════════════════ */
function noteFor(r: CampaignRecipient): string {
  if (r.bucket === 'failed') {
    const kind = r.kind ?? 'other'
    const info = FAILURE_KINDS[kind]
    const parts = [kind === 'other' ? (r.error || 'Sin detalle de Meta') : info.title]
    if (r.previousFailures > 0 && r.lastFailedAt) {
      parts.push(r.previousFailures === 1 ? `ya había fallado el ${day(r.lastFailedAt)}` : `ya había fallado ${r.previousFailures} veces (última: ${day(r.lastFailedAt)})`)
    }
    if (r.receivedLater) parts.push('ya la recibió en un reintento')
    if (r.attempts > 1) parts.push(`se intentó ${r.attempts} veces en esta campaña`)
    return parts.join(' · ')
  }
  if (r.bucket === 'pending') return `Enviado ${clock(r.sentAt)} · Meta aún no confirma la entrega`
  return `${r.bucket === 'read' ? 'Leído' : 'Entregado'} ${when(r.updatedAt)}`
}

function exportCampaign(c: CampaignDetail) {
  const head = ['Nombre', 'Teléfono', 'Segmento', 'Estado', 'Motivo', 'Respondió', 'Enviado', 'Última actualización']
  const rows = c.recipients.map(r => [
    r.name ?? '', fmtPhone(r.phone), r.segment ?? '', BUCKET_LABEL[r.bucket],
    r.bucket === 'failed' ? (r.kind && r.kind !== 'other' ? FAILURE_KINDS[r.kind].title : r.error ?? '') : '',
    r.replied ? 'Sí' : 'No', csvStamp(r.sentAt), csvStamp(r.updatedAt),
  ])
  downloadCsv(`campana-${c.template}-${csvStamp(c.startedAt).slice(0, 10)}.csv`, head, rows)
}

function CampaignDetailView({ id, onBack, onRetry, onOpenChat }: {
  id: string
  onBack: () => void
  onRetry: (retry: CampaignRetry) => void
  onOpenChat: (phone: string) => void
}) {
  const [data, setData]     = useState<CampaignDetail | null>(null)
  const [error, setError]   = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [shown, setShown]   = useState(PAGE)
  const [copied, setCopied] = useState(false)

  useQueryEffect(() => {
    let cancelled = false
    apiFetch(`/api/whatsapp/campaigns/history/${encodeURIComponent(id)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d })
      .then(d => { if (!cancelled) setData(d.campaign) })
      .catch(e => { if (!cancelled) setError(e?.message || 'No se pudo cargar la campaña') })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => { setShown(PAGE) }, [filter, search])

  const recipients = data?.recipients
  const groups = useMemo(() => {
    const map = new Map<FailureKind, CampaignRecipient[]>()
    for (const r of recipients ?? []) if (r.kind) map.set(r.kind, [...(map.get(r.kind) ?? []), r])
    return [...map].sort((a, b) => b[1].length - a[1].length)
  }, [recipients])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return (recipients ?? [])
      .filter(r => filter === 'all' || (filter === 'replied' ? r.replied : r.bucket === filter))
      .filter(r => !q || (r.name ?? '').toLowerCase().includes(q) || (digits.length >= 3 && r.phone.includes(digits)))
      .sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket])
  }, [recipients, filter, search])

  const back = (
    <button className="wa-link-btn" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
      <WaIcon.back size={16} /> Todas las campañas
    </button>
  )

  if (error) return <div className="wa-scroll">{back}<div className="wa-card wa-empty small"><WaIcon.alert size={20} />{error}</div></div>
  if (!data) return <div className="wa-scroll">{back}<div className="wa-card wa-empty small"><span className="wa-spinner" /></div></div>

  const reached = data.read + data.delivered
  const chips: [Filter, string, number][] = [
    ['all', 'Todos', data.total], ['read', 'Leídos', data.read], ['delivered', 'Entregados', data.delivered],
    ['pending', 'Pendientes', data.pending], ['failed', 'No entregados', data.failed], ['replied', 'Respondieron', data.replied],
  ]

  const copyFailed = async () => {
    const phones = data.recipients.filter(r => r.bucket === 'failed').map(r => r.phone)
    try {
      await navigator.clipboard.writeText(phones.join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* sin permiso del portapapeles */ }
  }

  return (
    <div className="wa-scroll">
      {back}
      <div className="wa-results-head">
        <div>
          <div className="wa-results-title" style={{ textTransform: 'capitalize' }}>{tplName(data.template)}</div>
          <div className="wa-results-sub">
            {when(data.startedAt)} · {data.total === 1 ? 'envío individual' : `${plural(data.total, 'destinatario', 'destinatarios')} · duró ${duration(data.startedAt, data.endedAt)}`}
          </div>
        </div>
      </div>

      <div className="wa-kpis">
        <Kpi label="Destinatarios" value={data.total} />
        <Kpi label="Entregados o leídos" value={`${pct(reached, data.total)}%`} sub={`${reached} de ${data.total}`} />
        <Kpi label="Pendientes" value={data.pending} sub={data.pending ? 'Meta aún no confirma' : undefined} />
        <Kpi label="Respondieron" value={data.replied} sub="dentro de 72 h" tone="good" />
        <Kpi label="No entregados" value={data.failed} sub={data.failed ? `${pct(data.failed, data.total)}% del total` : undefined} tone={data.failed ? 'bad' : undefined} />
      </div>

      <StatusBar s={data} />
      <Legend />

      {groups.length > 0 && (
        <div className="wa-card wa-fail">
          <div className="wa-fail-title">Por qué no llegaron</div>
          {groups.map(([kind, rs]) => {
            const info = FAILURE_KINDS[kind]
            const repeated = rs.filter(r => r.previousFailures > 0).length
            const targets = info.retry ? rs.filter(r => r.contactId && !r.receivedLater) : []
            const raw = kind === 'other' ? [...new Set(rs.map(r => r.error).filter(Boolean))].slice(0, 2).join(' · ') : ''
            return (
              <div className="wa-fail-item" key={kind}>
                <div className="wa-fail-main">
                  <strong>{rs.length} · {info.title}</strong>
                  {(info.hint || raw) && <div className="wa-fail-hint">{info.hint || raw}</div>}
                  {repeated > 0 && (
                    <div className="wa-fail-extra">
                      {repeated === rs.length && rs.length > 1 ? 'Todos' : repeated} ya habían fallado antes por lo mismo.
                    </div>
                  )}
                  {info.retry && rs.some(r => r.receivedLater) && (
                    <div className="wa-fail-hint">{plural(rs.filter(r => r.receivedLater).length, 'ya la recibió', 'ya la recibieron')} en un reintento.</div>
                  )}
                </div>
                {info.retry && (
                  targets.length > 0 ? (
                    <button className="btn btn-ghost" style={{ flexShrink: 0 }}
                      onClick={() => onRetry({ template: data.template, contactIds: targets.map(r => r.contactId as string), label: tplName(data.template) })}>
                      Reintentar a {targets.length}
                    </button>
                  ) : (
                    <span className="wa-fail-hint" style={{ flexShrink: 0 }}>Ya se reintentó</span>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="wa-card">
        <div className="wa-list-head">
          <div className="wa-seg" style={{ marginBottom: 0 }}>
            {chips.map(([key, label, n]) => (
              <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label} {n}</button>
            ))}
          </div>
          <label className="wa-search">
            <WaIcon.search />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre o teléfono…" />
            {search && <button onClick={() => setSearch('')} className="wa-clear" aria-label="Limpiar búsqueda">×</button>}
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="wa-empty small">Nadie coincide con este filtro.</div>
        ) : (
          <div className="wa-recips">
            {visible.slice(0, shown).map(r => (
              <div className="wa-recip" key={r.phone}>
                <Avatar name={r.name || r.phone} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div className="wa-recip-name">{r.name || fmtPhone(r.phone)}</div>
                  <div className="wa-recip-sub">{r.name ? fmtPhone(r.phone) : 'No está en Contactos'}{r.segment && <TipoChip value={r.segment} small />}</div>
                </div>
                <div className="wa-recip-state">
                  <span>
                    <span className={`wa-state ${r.bucket}`}>{BUCKET_LABEL[r.bucket]}</span>
                    {r.replied && <span className="wa-state replied">Respondió</span>}
                  </span>
                  <span className="wa-recip-note">{noteFor(r)}</span>
                </div>
                <div className="wa-recip-actions">
                  {r.replied && <button className="wa-icon-link" title="Abrir chat" aria-label="Abrir chat" onClick={() => onOpenChat(r.phone)}><WaIcon.chat size={15} /></button>}
                  {r.contactId && <Link className="wa-icon-link" href={`/contactos?id=${r.contactId}`} title="Ver ficha del contacto" aria-label="Ver ficha del contacto"><WaIcon.user size={15} /></Link>}
                </div>
              </div>
            ))}
          </div>
        )}

        {visible.length > shown && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--line)' }}>
            <button className="wa-link-btn" onClick={() => setShown(s => s + PAGE)}>Mostrar {Math.min(PAGE, visible.length - shown)} más ({visible.length - shown} restantes)</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
        <button className="btn btn-ghost" onClick={() => exportCampaign(data)}>Exportar lista (CSV)</button>
        {data.failed > 0 && <button className="btn btn-ghost" onClick={copyFailed}>{copied ? 'Copiados ✓' : `Copiar los ${data.failed} números no entregados`}</button>}
      </div>
    </div>
  )
}
