'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Avatar, TipoChip } from '@/components/CrmUI'
import { WhatsAppTemplatePicker, type WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import { useWhatsAppCampaignQuota, CampaignQuotaNote, isOverQuota } from '@/components/WhatsAppCampaignQuota'
import { useCampaignSend, CampaignConfirmPanel, CampaignProgressPanel, CampaignResultsPanel } from '@/components/WhatsAppCampaignSend'
import { WaIcon } from '@/components/WhatsAppUI'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { MARKETING_RETRY_HOURS, tierLabel } from '@/lib/whatsappSafety'
import { PERSON_STATES, PERSON_STATE_ORDER, type PersonState } from '@/lib/campaignKinds'

type Contact = { id: string; name: string; phone: string; segment?: string | null; wa_opt_out?: boolean }

/** Reintento desde Resultados: plantilla y contactos que se preseleccionan (el envío se confirma como siempre). */
export type CampaignPreset = { template: string; contactIds: string[]; label: string }

type Health = {
  config: { connected: boolean; source: 'store' | 'env'; businessAccount: boolean; appSecret: boolean }
  health: { displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string; messagingLimitTier?: string; canSendMessage?: string; healthNotes?: string[] } | null
}

type Stats = { marketingHold: string[]; states?: Record<string, PersonState> }

/** Filtro "Historial": cómo le fue a cada contacto con las campañas ('never' = nunca se le ha enviado una). */
type History = 'all' | 'never' | PersonState
const historyLabel = (h: Exclude<History, 'all'>) => (h === 'never' ? 'Sin campañas todavía' : PERSON_STATES[h].label)

// Calidad según las reacciones de los clientes (bloqueos, reportes, lecturas). Desde
// oct-2025 Meta ya no baja el límite por calidad, pero con calidad baja sostenida
// puede pausar plantillas o restringir el número.
const QUALITY: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted'; tip: string }> = {
  GREEN:   { label: 'Alta',  tone: 'good', tip: 'Calidad alta: puedes seguir enviando campañas con normalidad. Es requisito para que Meta suba tu límite.' },
  YELLOW:  { label: 'Media', tone: 'warn', tip: 'Calidad media: algunos clientes bloquearon o reportaron mensajes. Envía solo a quien aceptó recibirlos y espera tus mensajes.' },
  RED:     { label: 'Baja',  tone: 'bad',  tip: 'Calidad baja: Meta puede pausar tus plantillas o restringir el número si sigue así. Revisa a quién le envías y el contenido de tus plantillas.' },
  UNKNOWN: { label: 'Sin datos', tone: 'muted', tip: 'Meta aún no tiene suficiente historial para calificar el número.' },
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
  const status = data.health.canSendMessage
  const notes = data.health.healthNotes ?? []
  return (
    <div className={`wa-health tone-${status === 'BLOCKED' ? 'bad' : q.tone}`}>
      <div className="wa-health-main">
        <span className="wa-health-dot" />
        <div>
          <div className="wa-health-title">Calidad del número: <strong>{q.label}</strong></div>
          <div className="wa-health-tip">{q.tip}</div>
          {status === 'BLOCKED' && <div className="wa-health-tip"><strong>Meta tiene bloqueado el envío desde este número.</strong> {notes.join(' ')}</div>}
          {status === 'LIMITED' && notes.length > 0 && <div className="wa-health-tip"><strong>Aviso de Meta:</strong> {notes.join(' ')}</div>}
        </div>
      </div>
      <div className="wa-health-meta">
        {data.health.displayPhoneNumber && <span>{data.health.displayPhoneNumber}</span>}
        {data.health.messagingLimitTier && <span>Límite de Meta: {tierLabel(data.health.messagingLimitTier)}</span>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Campañas: elegir contactos + plantilla y enviar
══════════════════════════════════════════════════════════════════════════ */
export function WhatsAppCampaigns({ preset, onPresetApplied, onViewResults }: {
  preset?: CampaignPreset | null
  onPresetApplied?: () => void
  /** Después de enviar, lleva a Resultados (Meta confirma las entregas en los minutos siguientes). */
  onViewResults?: () => void
}) {
  const [retry, setRetry]         = useState<CampaignPreset | null>(preset ?? null)
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [segmentos, setSegmentos] = useState<string[]>([])
  const [segmentFilter, setSegmentFilter] = useState('Todos')
  const [history, setHistory]     = useState<History>('all')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<WhatsAppTemplateSelection | null>(null)
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
    fetch('/api/whatsapp/campaigns/stats').then(r => r.json()).then(d => { if (d.marketingHold) setStats(d) }).catch(() => {})
  }, [])

  // Reintento: al cargar los contactos se preselecciona a quienes no recibieron el mensaje
  const presetApplied = useRef(false)
  useEffect(() => {
    if (!retry || presetApplied.current || loading) return
    presetApplied.current = true
    const ids = new Set(retry.contactIds)
    setCheckedIds(new Set(contacts.filter(c => ids.has(c.id) && !c.wa_opt_out).map(c => c.id)))
    onPresetApplied?.()
  }, [retry, loading, contacts, onPresetApplied])

  // Meta pidió esperar 24 h antes de reenviarles marketing (error 131049); no aplica a plantillas de servicio
  const marketing = selection?.category !== 'UTILITY' && selection?.category !== 'AUTHENTICATION'
  const holdPhones = useMemo(
    () => new Set(marketing ? (stats?.marketingHold ?? []) : []),
    [stats, marketing],
  )
  const historyOf = (c: Contact): Exclude<History, 'all'> =>
    c.wa_opt_out ? 'opt_out' : stats?.states?.[normalizePhone(c.phone)] ?? 'never'
  const blockedReason = (c: Contact): string | null => {
    if (c.wa_opt_out) return 'Dado de baja'
    if (historyOf(c) === 'no_whatsapp') return 'Sin WhatsApp'
    if (holdPhones.has(normalizePhone(c.phone))) return `Meta pidió esperar ${MARKETING_RETRY_HOURS} h`
    return null
  }

  const historyCounts = useMemo(() => {
    const map = new Map<Exclude<History, 'all'>, number>()
    for (const c of contacts) {
      const h = historyOf(c)
      map.set(h, (map.get(h) ?? 0) + 1)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, stats])
  const noWhatsAppCount = historyCounts.get('no_whatsapp') ?? 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return contacts.filter(c => {
      if (segmentFilter !== 'Todos' && c.segment !== segmentFilter) return false
      if (history !== 'all' && historyOf(c) !== history) return false
      if (!q) return true
      return c.name?.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.includes(digits))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, search, segmentFilter, history, stats])

  // Si cambian las exclusiones, quita de la selección a quien ya no es elegible
  useEffect(() => {
    setCheckedIds(prev => {
      const next = new Set([...prev].filter(id => { const c = contacts.find(x => x.id === id); return c && !blockedReason(c) }))
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdPhones, contacts])

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
  const overQuota = isOverQuota(quota, selectedContacts.length)
  const canSend = !!selection?.ready && selectedContacts.length > 0 && !overQuota && quota?.canSendMessage !== 'BLOCKED'

  const handleConfirmed = async () => {
    if (!selection) return
    await run(selectedContacts.map(c => ({ id: c.id, name: c.name, phone: c.phone })), selection)
    setRetry(null)
    refetchQuota()
    fetch('/api/whatsapp/campaigns/stats').then(r => r.json()).then(d => { if (d.marketingHold) setStats(d) }).catch(() => {})
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
              onDone={() => { reset(); clearSelection() }} doneLabel="Enviar otra campaña"
              onViewResults={onViewResults ? () => { reset(); clearSelection(); onViewResults() } : undefined} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="wa-scroll wa-campaign-wrap">
      <NumberHealthCard />
      {retry && (
        <div className="wa-retry">
          <div>
            <strong>Reintento de «{retry.label}»</strong>
            <span>
              {checkedIds.size === 0 ? 'Ninguno de los contactos se puede volver a elegir (se dieron de baja, no tienen WhatsApp o Meta pidió esperar).' : `${checkedIds.size} contacto${checkedIds.size !== 1 ? 's' : ''} elegido${checkedIds.size !== 1 ? 's' : ''}. Revisa la plantilla y confirma el envío.`}
            </span>
            {selection?.templateName && selection.templateName !== retry.template && (
              <em>La plantilla elegida ahora es «{selection.templateName.replace(/_/g, ' ')}», no la del reintento.</em>
            )}
          </div>
          <button className="wa-link-btn muted" onClick={() => { setRetry(null); clearSelection() }}>Cancelar reintento</button>
        </div>
      )}
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
            <div className="wa-picker-filters">
              <select className="wa-select" value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)} aria-label="Segmento">
                <option value="Todos">Todos los segmentos</option>
                {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="wa-select" value={history} onChange={e => setHistory(e.target.value as History)} aria-label="Historial de campañas"
                title="Cómo le fue a cada contacto con tus campañas anteriores">
                <option value="all">Todo el historial</option>
                {(['never', ...PERSON_STATE_ORDER] as const).filter(h => historyCounts.get(h) || history === h).map(h => (
                  <option key={h} value={h}>{historyLabel(h)} ({historyCounts.get(h) ?? 0})</option>
                ))}
              </select>
            </div>
            {noWhatsAppCount > 0 && (
              <div className="wa-nowa-note">
                <WaIcon.ban size={13} />
                <span>
                  {noWhatsAppCount === 1
                    ? '1 contacto queda fuera porque Meta reportó que no tiene WhatsApp (puede ser un teléfono fijo).'
                    : `${noWhatsAppCount} contactos quedan fuera porque Meta reportó que no tienen WhatsApp (pueden ser teléfonos fijos).`}
                </span>
              </div>
            )}
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
                  {blocked && <span className={`wa-blocked-tag ${blocked === 'Sin WhatsApp' ? 'nowa' : ''}`}>{blocked}</span>}
                </label>
              )
            })}
          </div>
        </section>

        {/* Plantilla + envío */}
        <section className="wa-card wa-builder">
          <div className="wa-builder-body">
            <WhatsAppTemplatePicker exampleName={exampleName} onChange={setSelection} initialTemplateName={retry?.template} />
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
