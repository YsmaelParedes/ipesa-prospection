'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Avatar, TipoChip } from '@/components/IpesaUI'
import { WhatsAppTemplatePicker, type WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import { useWhatsAppCampaignQuota, CampaignQuotaNote } from '@/components/WhatsAppCampaignQuota'
import { useCampaignSend, CampaignConfirmPanel, CampaignProgressPanel, CampaignResultsPanel } from '@/components/WhatsAppCampaignSend'
import { WaIcon } from '@/components/WhatsAppUI'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { TEMPLATE_REPEAT_DAYS } from '@/lib/whatsappSafety'

type Contact = { id: string; name: string; phone: string; segment?: string | null; wa_opt_out?: boolean }

type Health = {
  config: { connected: boolean; source: 'store' | 'env'; businessAccount: boolean; appSecret: boolean }
  health: { displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string; messagingLimitTier?: string } | null
}

type Stats = {
  days: number
  repeatDays: number
  recentRecipients: Record<string, string[]>
  templates: {
    template: string; sent: number; delivered: number; read: number; failed: number; replied: number
    lastSentAt: string; topErrors: { error: string; count: number }[]
  }[]
}

const QUALITY: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted'; tip: string }> = {
  GREEN:   { label: 'Alta',  tone: 'good', tip: 'Calidad alta: puedes seguir enviando campañas con normalidad.' },
  YELLOW:  { label: 'Media', tone: 'warn', tip: 'Calidad media: baja la frecuencia y envía solo a quien realmente le interese.' },
  RED:     { label: 'Baja',  tone: 'bad',  tip: 'Calidad baja: pausa las campañas unos días para evitar que Meta restrinja el número.' },
  UNKNOWN: { label: 'Sin datos', tone: 'muted', tip: 'Meta aún no tiene suficiente historial para calificar el número.' },
}
const TIERS: Record<string, string> = {
  TIER_50: '50 clientes/día', TIER_250: '250 clientes/día', TIER_1K: '1,000 clientes/día',
  TIER_10K: '10,000 clientes/día', TIER_100K: '100,000 clientes/día', TIER_UNLIMITED: 'Sin límite',
}

let healthPromise: Promise<Health | null> | null = null
function loadHealth() {
  healthPromise ??= fetch('/api/whatsapp/status').then(r => (r.ok ? r.json() : null)).catch(() => null)
  return healthPromise
}

/** Calificación de calidad y nivel de mensajería del número en Meta. */
export function NumberHealthCard() {
  const [data, setData] = useState<Health | null | undefined>(undefined)
  useEffect(() => { loadHealth().then(setData) }, [])
  if (data === undefined) return <div className="wa-health"><span className="wa-spinner sm" /> Consultando el estado del número en Meta…</div>
  if (data && !data.config.connected) {
    return (
      <div className="wa-health">
        <WaIcon.alert /> Tu tienda aún no conecta su número de WhatsApp.
        <Link href="/configuracion?tab=whatsapp" style={{ marginLeft: 6, fontWeight: 800, color: 'var(--brand-strong)' }}>Conectarlo ahora</Link>
      </div>
    )
  }
  if (!data?.health) {
    return <div className="wa-health"><WaIcon.alert /> No se pudo consultar la calidad del número en Meta (revisa el token en Configuración → WhatsApp).</div>
  }
  const q = QUALITY[data.health.qualityRating ?? 'UNKNOWN'] ?? QUALITY.UNKNOWN
  return (
    <div className={`wa-health tone-${q.tone}`}>
      <div className="wa-health-main">
        <span className="wa-health-dot" />
        <div>
          <div className="wa-health-title">Calidad del número: <strong>{q.label}</strong></div>
          <div className="wa-health-tip">{q.tip}</div>
        </div>
      </div>
      <div className="wa-health-meta">
        {data.health.displayPhoneNumber && <span>{data.health.displayPhoneNumber}</span>}
        {data.health.messagingLimitTier && <span>Límite de Meta: {TIERS[data.health.messagingLimitTier] ?? data.health.messagingLimitTier}</span>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Campañas: elegir contactos + plantilla y enviar
══════════════════════════════════════════════════════════════════════════ */
export function WhatsAppCampaigns() {
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [segmentos, setSegmentos] = useState<string[]>([])
  const [segmentFilter, setSegmentFilter] = useState('Todos')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<WhatsAppTemplateSelection | null>(null)
  const [skipRecent, setSkipRecent] = useState(true)
  const [stats, setStats]         = useState<Stats | null>(null)
  const { quota, refetch: refetchQuota } = useWhatsAppCampaignQuota()
  const { phase, total, done, sent, failed, skipped, outcomes, stopReason, askConfirm, backToForm, run, cancel, reset } = useCampaignSend()

  useEffect(() => {
    fetch('/api/data/contacts')
      .then(r => r.json())
      .then(d => setContacts((d.contacts || []).filter((c: Contact) => normalizePhone(c.phone).length === 10)))
      .catch(() => {})
      .finally(() => setLoading(false))
    fetch('/api/data/config?type=segment')
      .then(r => r.json())
      .then(d => setSegmentos((d.items ?? []).map((i: { label: string }) => i.label)))
      .catch(() => {})
    fetch('/api/whatsapp/campaigns/stats?days=30').then(r => r.json()).then(d => { if (d.templates) setStats(d) }).catch(() => {})
  }, [])

  // Quienes ya recibieron la plantilla elegida en los últimos días
  const recentPhones = useMemo(
    () => new Set(selection?.templateName ? (stats?.recentRecipients[selection.templateName] ?? []) : []),
    [stats, selection?.templateName],
  )
  const blockedReason = (c: Contact): string | null => {
    if (c.wa_opt_out) return 'Dado de baja'
    if (skipRecent && recentPhones.has(normalizePhone(c.phone))) return `Ya la recibió (${TEMPLATE_REPEAT_DAYS} días)`
    return null
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return contacts.filter(c => {
      if (segmentFilter !== 'Todos' && c.segment !== segmentFilter) return false
      if (!q) return true
      return c.name?.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.includes(digits))
    })
  }, [contacts, search, segmentFilter])

  // Si cambian las exclusiones, quita de la selección a quien ya no es elegible
  useEffect(() => {
    setCheckedIds(prev => {
      const next = new Set([...prev].filter(id => { const c = contacts.find(x => x.id === id); return c && !blockedReason(c) }))
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentPhones, skipRecent, contacts])

  const toggle = (c: Contact) => {
    if (blockedReason(c)) return
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
      return next
    })
  }
  const selectAllFiltered = () => setCheckedIds(prev => {
    const next = new Set(prev)
    const cap = quota?.remaining ?? Infinity
    for (const c of filtered) {
      if (next.size >= cap) break
      if (!blockedReason(c)) next.add(c.id)
    }
    return next
  })
  const clearSelection = () => setCheckedIds(new Set())

  const selectedContacts = contacts.filter(c => checkedIds.has(c.id))
  const eligibleCount = filtered.filter(c => !blockedReason(c)).length
  const exampleName = (selectedContacts[0]?.name || 'Cliente').trim().split(/\s+/)[0]
  const overQuota = !!quota && selectedContacts.length > quota.remaining
  const canSend = !!selection?.ready && selectedContacts.length > 0 && !overQuota

  const handleConfirmed = async () => {
    if (!selection) return
    await run(selectedContacts.map(c => ({ id: c.id, name: c.name, phone: c.phone })), selection, { skipRecent })
    refetchQuota()
    fetch('/api/whatsapp/campaigns/stats?days=30').then(r => r.json()).then(d => { if (d.templates) setStats(d) }).catch(() => {})
  }

  if (phase !== 'idle') {
    return (
      <div className="wa-scroll">
        <div className="wa-card wa-campaign-status">
          {phase === 'confirm' && (
            <CampaignConfirmPanel targetCount={selectedContacts.length} selection={selection} quota={quota} onConfirm={handleConfirmed} onCancel={backToForm} />
          )}
          {phase === 'sending' && (
            <CampaignProgressPanel total={total} done={done} sent={sent} failed={failed} skipped={skipped} onCancel={cancel} />
          )}
          {phase === 'results' && (
            <CampaignResultsPanel sent={sent} skipped={skipped} failed={failed} outcomes={outcomes} stopReason={stopReason}
              onDone={() => { reset(); clearSelection() }} doneLabel="Enviar otra campaña" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="wa-scroll wa-campaign-wrap">
      <NumberHealthCard />
      <div className="wa-campaign">
        {/* Selector de contactos */}
        <section className="wa-card wa-picker">
          <div className="wa-list-head">
            <div className="wa-list-title">
              <span>Destinatarios</span>
              {checkedIds.size > 0 && <span className="wa-picked">{checkedIds.size} elegidos</span>}
            </div>
            <label className="wa-search">
              <WaIcon.search />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre o teléfono…" />
            </label>
            <select className="wa-select" value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} aria-label="Tipo de cliente">
              <option value="Todos">Todos los tipos</option>
              {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="wa-check-row">
              <input type="checkbox" checked={skipRecent} onChange={e => setSkipRecent(e.target.checked)} />
              <span>Omitir a quien ya recibió esta plantilla en los últimos {TEMPLATE_REPEAT_DAYS} días</span>
            </label>
            <div className="wa-picker-actions">
              <button onClick={selectAllFiltered} className="wa-link-btn" disabled={!eligibleCount}>
                Elegir todos ({Math.min(eligibleCount, quota?.remaining ?? eligibleCount)})
              </button>
              {checkedIds.size > 0 && <button onClick={clearSelection} className="wa-link-btn muted">Limpiar</button>}
            </div>
          </div>
          <div className="wa-list">
            {loading ? (
              <div className="wa-thread-loading"><span className="wa-spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="wa-empty small">Sin contactos con celular que coincidan.</div>
            ) : filtered.map(c => {
              const blocked = blockedReason(c)
              const checked = checkedIds.has(c.id)
              return (
                <label key={c.id} className={`wa-pick-row ${checked ? 'checked' : ''} ${blocked ? 'blocked' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={!!blocked} onChange={() => toggle(c)} />
                  <Avatar name={c.name || c.phone} size={32} />
                  <span className="wa-pick-main">
                    <span className="wa-pick-name">{c.name || fmtPhone(c.phone)}</span>
                    <span className="wa-pick-sub">
                      {fmtPhone(c.phone)}
                      {c.segment && <TipoChip value={c.segment} small />}
                    </span>
                  </span>
                  {blocked && <span className="wa-blocked-tag">{blocked}</span>}
                </label>
              )
            })}
          </div>
        </section>

        {/* Plantilla + envío */}
        <section className="wa-card wa-builder">
          <div className="wa-builder-body">
            <WhatsAppTemplatePicker exampleName={exampleName} onChange={setSelection} />
            <CampaignQuotaNote quota={quota} selectedCount={selectedContacts.length} />
          </div>
          <div className="wa-builder-foot">
            <span>
              {selectedContacts.length === 0
                ? 'Elige al menos un contacto de la lista.'
                : <>Se enviará a <strong>{selectedContacts.length}</strong> contacto{selectedContacts.length !== 1 ? 's' : ''}.</>}
            </span>
            <button className="btn btn-primary" onClick={askConfirm} disabled={!canSend}>
              <WaIcon.send size={15} /> Enviar a {selectedContacts.length}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Resultados de campañas
══════════════════════════════════════════════════════════════════════════ */
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

export function WhatsAppCampaignResults() {
  const [days, setDays]   = useState(30)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setStats(null); setError('')
    fetch(`/api/whatsapp/campaigns/stats?days=${days}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setStats(d) })
      .catch(e => setError(e?.message || 'No se pudieron cargar los resultados'))
  }, [days])

  const totals = useMemo(() => (stats?.templates ?? []).reduce(
    (a, t) => ({ sent: a.sent + t.sent, delivered: a.delivered + t.delivered, read: a.read + t.read, replied: a.replied + t.replied, failed: a.failed + t.failed }),
    { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 },
  ), [stats])

  return (
    <div className="wa-scroll">
      <div className="wa-results-head">
        <div>
          <div className="wa-results-title">Resultados de campañas</div>
          <div className="wa-results-sub">Entregas, lecturas y respuestas de las plantillas enviadas</div>
        </div>
        <div className="wa-seg">
          {[7, 30, 90].map(d => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} días</button>)}
        </div>
      </div>

      {error ? (
        <div className="wa-card wa-empty small"><WaIcon.alert size={20} />{error}</div>
      ) : !stats ? (
        <div className="wa-card wa-empty small"><span className="wa-spinner" /></div>
      ) : stats.templates.length === 0 ? (
        <div className="wa-card wa-empty small"><WaIcon.chart size={26} /> No se han enviado plantillas en este periodo.</div>
      ) : (
        <>
          <div className="wa-kpis">
            <Kpi label="Enviadas" value={totals.sent} />
            <Kpi label="Entregadas" value={`${pct(totals.delivered, totals.sent)}%`} sub={`${totals.delivered} mensajes`} />
            <Kpi label="Leídas" value={`${pct(totals.read, totals.sent)}%`} sub={`${totals.read} mensajes`} />
            <Kpi label="Respondieron" value={`${pct(totals.replied, totals.sent)}%`} sub={`${totals.replied} personas`} highlight />
            <Kpi label="Fallidas" value={totals.failed} tone={totals.failed ? 'bad' : undefined} />
          </div>

          <div className="wa-template-stats">
            {stats.templates.map(t => (
              <div className="wa-card wa-tstat" key={t.template}>
                <div className="wa-tstat-head">
                  <div>
                    <div className="wa-tstat-name">{t.template.replace(/_/g, ' ')}</div>
                    <div className="wa-tstat-sub">Último envío: {new Date(t.lastSentAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="wa-tstat-total"><strong>{t.sent}</strong><span>enviadas</span></div>
                </div>
                <Funnel label="Entregadas" value={t.delivered} total={t.sent} color="var(--success-fill)" />
                <Funnel label="Leídas" value={t.read} total={t.sent} color="#34B7F1" />
                <Funnel label="Respondieron (72 h)" value={t.replied} total={t.sent} color="var(--brand)" />
                {t.failed > 0 && (
                  <div className="wa-tstat-errors">
                    <div><WaIcon.alert size={13} /> {t.failed} no se entregaron</div>
                    {t.topErrors.map((e, i) => <div key={i} className="wa-tstat-error">{e.count} × {e.error}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, highlight, tone }: { label: string; value: number | string; sub?: string; highlight?: boolean; tone?: 'bad' }) {
  return (
    <div className={`wa-kpi ${highlight ? 'hl' : ''} ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function Funnel({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total)
  return (
    <div className="wa-funnel">
      <div className="wa-funnel-top"><span>{label}</span><span><strong>{p}%</strong> · {value}</span></div>
      <div className="wa-funnel-bar"><div style={{ width: `${p}%`, background: color }} /></div>
    </div>
  )
}
