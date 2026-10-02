'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Avatar, CanalChip, EstadoChip, SegmentoChip, OwnerChip, FilterDropdown, fmtDate, fmtDateLong, fmtPhone, normalizePhone } from '@/components/CrmUI'
import { useSession } from '@/lib/profile'
import { useCatalogs } from '@/lib/catalogs'
import { LEAD_ESTADOS, LOST, OPEN_ESTADOS, WON, isOpenLead, remTypeInfo, reminderTitle, type Reminder, type ReminderType } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { QUICK_WHEN, fmtAgo, fmtDue, isDueToday, isOverdue, localNow, quickDate, toDbLocal, type QuickWhen } from '@/lib/datetime'

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
const ESTADOS: readonly string[] = LEAD_ESTADOS

const ACTIVITY_TYPES = [
  { key: 'call',     label: 'Llamada',    emoji: '📞', color: 'var(--c-cyan-ink)',    bg: 'var(--c-cyan-soft)',    next: 'call' },
  { key: 'whatsapp', label: 'WhatsApp',   emoji: '💬', color: '#128C4A',              bg: '#E3F7EA',               next: 'whatsapp' },
  { key: 'quote',    label: 'Cotización', emoji: '📋', color: 'var(--warning)',       bg: 'var(--warning-soft)',   next: 'call' },
  { key: 'visit',    label: 'Visita',     emoji: '🏪', color: 'var(--c-teal-ink)',    bg: 'var(--c-teal-soft)',    next: 'call' },
  { key: 'meeting',  label: 'Reunión',    emoji: '🤝', color: 'var(--c-purple-ink)',  bg: 'var(--c-purple-soft)',  next: 'meeting' },
  { key: 'email',    label: 'Correo',     emoji: '📧', color: 'var(--c-magenta-ink)', bg: 'var(--c-magenta-soft)', next: 'email' },
  { key: 'note',     label: 'Nota',       emoji: '📝', color: 'var(--muted)',         bg: 'var(--paper-2)',        next: 'task' },
] as const
type AType = typeof ACTIVITY_TYPES[number]['key']
const getAType = (key: string) => ACTIVITY_TYPES.find(t => t.key === key) ?? ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1]

type Activity = {
  id: string; lead_id: string; user_id: string
  type: AType; description: string | null; amount: number | null
  activity_date: string; created_at: string
}

type Tab = 'abiertos' | 'ganados' | 'perdidos' | 'todos'
const TABS: { key: Tab; label: string; match: (estado: string) => boolean; columns: readonly string[] }[] = [
  { key: 'abiertos', label: 'Abiertos', match: isOpenLead,          columns: OPEN_ESTADOS },
  { key: 'ganados',  label: 'Ganados',  match: e => e === WON,      columns: [WON] },
  { key: 'perdidos', label: 'Perdidos', match: e => e === LOST,     columns: [LOST] },
  { key: 'todos',    label: 'Todos',    match: () => true,          columns: ESTADOS },
]

const ESTADO_COLORS: Record<string, string> = {
  'Nuevo': 'var(--c-cyan)', 'En seguimiento': 'var(--warning-fill)',
  'Cotizado': 'var(--c-magenta)', [WON]: 'var(--success-fill)', [LOST]: 'var(--muted-2)',
}

const money = (n: number | string | null | undefined) => `$${Number(n || 0).toLocaleString('es-MX')}`
const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || name

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function buildQuoteText(name: string, description: string, amount: number | null, storeName: string) {
  return [
    `Hola ${name}, te comparto la cotización de ${storeName}:`,
    '',
    description || '(Descripción de la cotización)',
    ...(amount ? ['', `💰 Total: ${money(amount)} MXN`] : []),
    '',
    '¿Tienes alguna pregunta? Estamos a tus órdenes. 🎨',
  ].join('\n')
}

function buildWhatsApp(phone: string, name: string, description: string, amount: number | null, storeName: string) {
  return `https://wa.me/52${normalizePhone(phone)}?text=${encodeURIComponent(buildQuoteText(name, description, amount, storeName))}`
}

/** ¿Está abierta la ventana de 24 h con este número? (para enviar desde el número del negocio) */
function useWhatsAppWindow(phone: string | null | undefined, enabled: boolean) {
  const [open, setOpen] = useState(false)
  const p = normalizePhone(phone || '')
  useEffect(() => {
    if (!enabled || p.length !== 10) return
    fetch(`/api/whatsapp/conversations/${p}?preview=1&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setOpen(!!d?.windowOpen))
      .catch(() => {})
  }, [p, enabled])
  return enabled && p.length === 10 && open
}

/** Estado del próximo seguimiento de un lead (para la lista y el kanban). */
function followUpOf(lead: any, now: Date): { tone: 'overdue' | 'today' | 'scheduled' | 'none' | 'closed'; label: string } {
  if (!isOpenLead(lead.estado)) return { tone: 'closed', label: '—' }
  if (!lead.next_reminder_at) return { tone: 'none', label: 'Sin programar' }
  const iso = lead.next_reminder_at as string
  if (isOverdue(iso, now)) return { tone: 'overdue', label: `Vencido · ${fmtDue(iso, now)}` }
  if (isDueToday(iso, now)) return { tone: 'today', label: fmtDue(iso, now) }
  return { tone: 'scheduled', label: fmtDue(iso, now) }
}

/** Abiertos primero lo urgente: vencidos, luego sin programar, luego por fecha. */
function urgency(lead: any, now: Date) {
  const f = followUpOf(lead, now).tone
  return f === 'overdue' ? 0 : f === 'today' ? 1 : f === 'none' ? 2 : f === 'scheduled' ? 3 : 4
}

/* ══════════════════════════════════════════════════════════
   ICONOS
══════════════════════════════════════════════════════════ */
const Ico = {
  close:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  plus:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  phone:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  mail:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  table:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
  kanban:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/></svg>,
  chevron:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><path d="m9 18 6-6-6-6"/></svg>,
  check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--warning-fill)' }}><path d="m5 13 4 4L19 7"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  edit:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  search:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)' }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  history:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>,
  bell:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  info:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  send:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>,
  user:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
}

/* ══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function LeadsPage() {
  // useSearchParams (?id= para abrir un lead directo) requiere Suspense
  return <Suspense fallback={null}><LeadsContent /></Suspense>
}

function LeadsContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const deepId       = searchParams.get('id')
  const session      = useSession()
  const isAdmin      = !!session?.isAdmin
  const readonly     = session?.store?.access === 'readonly'

  const [leads, setLeads]       = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [view, setView]         = useState<'tabla' | 'kanban'>('tabla')
  const [tab, setTab]           = useState<Tab>('abiertos')
  const [canalF, setCanalF]     = useState('Todos')
  const [segF, setSegF]         = useState('Todos')
  const [ownerF, setOwnerF]     = useState('Todos')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [toast, setToast]       = useState('')
  const [now, setNow]           = useState(() => new Date())

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/data/leads')
      const d = await r.json()
      const list: any[] = d.leads || []
      setLeads(list)
      setNow(new Date())
      // La ficha abierta se refresca con los datos nuevos
      setSelected((prev: any) => prev ? (list.find(l => l.id === prev.id) ?? prev) : prev)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useDataChanged(['lead', 'reminder'], load)

  /* Abrir el lead indicado en la URL (?id=…), p. ej. desde el buscador, WhatsApp o Contactos */
  useEffect(() => {
    if (!deepId || loading) return
    const found = leads.find(l => l.id === deepId)
    if (found) setSelected(found)
  }, [deepId, loading, leads])

  const closeDetail = () => {
    setSelected(null)
    if (deepId) router.replace('/leads', { scroll: false })
  }

  const canales   = useMemo(() => Array.from(new Set(leads.map(l => l.canal).filter(Boolean))).sort() as string[], [leads])
  const segmentos = useMemo(() => Array.from(new Set(leads.map(l => l.segmento).filter(Boolean))).sort() as string[], [leads])
  const owners    = useMemo(() => Array.from(new Set(leads.map(l => l.owner_name).filter(Boolean))) as string[], [leads])
  const multiOwner = isAdmin && owners.length > 1

  // Filtros comunes (canal, segmento, vendedor, búsqueda) antes de separar por estado
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter(l => {
      if (canalF !== 'Todos' && l.canal !== canalF) return false
      if (segF   !== 'Todos' && l.segmento !== segF) return false
      if (ownerF !== 'Todos' && l.owner_name !== ownerF) return false
      if (q && !`${l.name} ${l.phone || ''} ${l.email || ''} ${l.notas || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [leads, canalF, segF, ownerF, search])

  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, base.filter(l => t.match(l.estado)).length])) as Record<Tab, number>, [base])
  const tabInfo = TABS.find(t => t.key === tab)!
  const filtered = useMemo(() => {
    const list = base.filter(l => tabInfo.match(l.estado))
    if (tab !== 'abiertos') return list
    return [...list].sort((a, b) => {
      const ua = urgency(a, now), ub = urgency(b, now)
      if (ua !== ub) return ua - ub
      if (a.next_reminder_at && b.next_reminder_at) return a.next_reminder_at.localeCompare(b.next_reminder_at)
      return String(b.created_at).localeCompare(String(a.created_at))
    })
  }, [base, tabInfo, tab, now])
  const openValue = useMemo(() => base.filter(l => isOpenLead(l.estado)).reduce((s, l) => s + (Number(l.monto) || 0), 0), [base])
  const filtersOn = canalF !== 'Todos' || segF !== 'Todos' || ownerF !== 'Todos' || !!search.trim()

  const updateEstado = async (id: string, estado: string) => {
    const r = await fetch(`/api/data/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    if (!r.ok) { showToast('No se pudo cambiar el estado'); return }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, estado } : l))
    setSelected((s: any) => s?.id === id ? { ...s, estado } : s)
    notifyDataChanged('lead')
    showToast(`Estado: ${estado}`)
  }

  const scheduleFor = (l: any) => openQuickCreate({
    kind: 'reminder',
    defaults: { lead_id: l.id, lead_name: l.name, type: 'call', nota: `Dar seguimiento a ${firstName(l.name)}` },
  })

  return (
    <>
      <div className="section-head">
        <h2>Leads</h2>
        {!loading && <span className="count">{counts.abiertos} abierto{counts.abiertos !== 1 ? 's' : ''}{openValue > 0 ? ` · ${money(openValue)} en juego` : ''}</span>}
        <div className="section-actions">
          <div className="view-toggle" role="group" aria-label="Vista">
            <button className={view === 'tabla' ? 'active' : ''} onClick={() => setView('tabla')} aria-pressed={view === 'tabla'} title="Tabla"><Ico.table /> <span className="hide-sm">Tabla</span></button>
            <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')} aria-pressed={view === 'kanban'} title="Kanban"><Ico.kanban /> <span className="hide-sm">Kanban</span></button>
          </div>
          {!readonly && (
            <button className="btn btn-primary page-primary" onClick={() => openQuickCreate({ kind: 'lead' })}>
              <Ico.plus /> Nuevo lead
            </button>
          )}
        </div>
      </div>

      <div className="status-tabs" role="tablist" aria-label="Estado de los leads">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`status-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{!loading && <span className="status-tab-count">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="list-controls">
        <label className="list-search">
          <Ico.search />
          <input placeholder="Buscar por nombre, teléfono o nota…" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setSearch('') }} />
          {search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda">×</button>}
        </label>
        <div className="filter-bar">
          {canales.length > 0 && <FilterDropdown value={canalF} options={canales} onChange={setCanalF} triggerLabel={v => v === 'Todos' ? 'Canal' : `Canal: ${v}`} searchPlaceholder="Buscar canal…" />}
          {segmentos.length > 0 && <FilterDropdown value={segF} options={segmentos} onChange={setSegF} triggerLabel={v => v === 'Todos' ? 'Segmento' : `Segmento: ${v}`} searchPlaceholder="Buscar segmento…" />}
          {multiOwner && (
            <FilterDropdown value={ownerF} options={owners} onChange={setOwnerF} triggerLabel={v => v === 'Todos' ? 'Vendedor' : `Vendedor: ${v}`} searchPlaceholder="Buscar vendedor…" />
          )}
          {(canalF !== 'Todos' || segF !== 'Todos' || ownerF !== 'Todos') && (
            <button className="filter-pill" onClick={() => { setCanalF('Todos'); setSegF('Todos'); setOwnerF('Todos') }}>Limpiar filtros</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {filtersOn ? 'Ningún lead coincide con estos filtros.'
            : tab === 'abiertos' ? <>No tienes leads abiertos.{!readonly && <> <button className="link-btn" onClick={() => openQuickCreate({ kind: 'lead' })}>Registrar uno</button></>}</>
            : tab === 'ganados' ? 'Todavía no hay ventas ganadas.'
            : tab === 'perdidos' ? 'Sin leads perdidos.'
            : 'Sin leads aún.'}
        </div>
      ) : view === 'tabla' ? (
        <LeadsTable leads={filtered} onSelect={setSelected} multiOwner={multiOwner} now={now} onSchedule={readonly ? undefined : scheduleFor} />
      ) : (
        <LeadsKanban leads={filtered} columns={tabInfo.columns} onSelect={setSelected} multiOwner={multiOwner} now={now} />
      )}

      {selected && (
        <LeadDetail
          key={selected.id}
          lead={selected}
          isAdmin={isAdmin}
          readonly={readonly}
          storeName={session?.store?.name || 'nuestra tienda'}
          waModule={!session?.store || session.store.modules.whatsapp}
          onClose={closeDetail}
          onChangeEstado={updateEstado}
          onPatched={patch => {
            setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, ...patch } : l))
            setSelected((s: any) => s ? { ...s, ...patch } : s)
            notifyDataChanged('lead')
          }}
          onDeleted={id => { setLeads(prev => prev.filter(l => l.id !== id)); closeDetail(); notifyDataChanged('lead'); showToast('Lead eliminado') }}
          toast={showToast}
        />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}

/* ══════════════════════════════════════════════════════════
   LISTA Y KANBAN
══════════════════════════════════════════════════════════ */
function FollowUpCell({ lead, now, onSchedule }: { lead: any; now: Date; onSchedule?: (l: any) => void }) {
  const f = followUpOf(lead, now)
  if (f.tone === 'closed') return <span className="cell-muted">—</span>
  if (f.tone === 'none') {
    return onSchedule
      ? <button className="follow-chip none" onClick={e => { e.stopPropagation(); onSchedule(lead) }} title="Programar el siguiente seguimiento">+ Programar</button>
      : <span className="follow-chip none">Sin programar</span>
  }
  return <span className={`follow-chip ${f.tone}`}>{f.label}</span>
}

function LeadsTable({ leads, onSelect, multiOwner, now, onSchedule }: {
  leads: any[]; onSelect: (l: any) => void; multiOwner: boolean; now: Date; onSchedule?: (l: any) => void
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Lead</th><th>Estado</th><th>Seguimiento</th>
            <th style={{ textAlign: 'right' }}>Valor</th>
            <th>Canal</th><th className="col-secondary">Segmento</th>
            <th className="col-secondary" style={{ textAlign: 'right' }}>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {leads.map(l => (
            <tr key={l.id} onClick={() => onSelect(l)}>
              <td>
                <div className="cell-name">
                  <Avatar name={l.name} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div className="nm" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div className="em">{fmtPhone(l.phone) || l.email || ''}</div>
                    {multiOwner && l.owner_name && <div style={{ marginTop: 3 }}><OwnerChip value={l.owner_name} small /></div>}
                  </div>
                </div>
              </td>
              <td data-label="Estado"><EstadoChip value={l.estado || '—'} small /></td>
              <td data-label="Seguimiento"><FollowUpCell lead={l} now={now} onSchedule={onSchedule} /></td>
              <td data-label="Valor" className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{l.monto ? money(l.monto) : '—'}</td>
              <td data-label="Canal">{l.canal ? <CanalChip value={l.canal} small /> : <span className="cell-muted">—</span>}</td>
              <td data-label="Segmento" className="col-secondary">{l.segmento ? <SegmentoChip value={l.segmento} small /> : <span className="cell-muted">—</span>}</td>
              <td data-label="Fecha" className="cell-muted col-secondary" style={{ textAlign: 'right' }}>{fmtDate(l.fecha || l.created_at?.slice(0, 10) || '')}</td>
              <td className="cell-chevron" style={{ width: 36, textAlign: 'right' }}><Ico.chevron /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LeadsKanban({ leads, columns, onSelect, multiOwner, now }: {
  leads: any[]; columns: readonly string[]; onSelect: (l: any) => void; multiOwner: boolean; now: Date
}) {
  return (
    <div className="kanban" style={{ '--kanban-cols': columns.length } as React.CSSProperties}>
      {columns.map(estado => {
        const col = leads.filter(l => l.estado === estado)
        const valor = col.reduce((s, l) => s + (Number(l.monto) || 0), 0)
        return (
          <div className="kanban-col" key={estado}>
            <div className="kanban-head">
              <EstadoChip value={estado} small />
              <span className="kcount">{col.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '0 2px 6px', fontWeight: 500 }}>
              {valor > 0 ? `${money(valor)} potencial` : 'Sin valor estimado'}
            </div>
            {col.map(l => {
              const f = followUpOf(l, now)
              return (
                <div className="lead-card" key={l.id} onClick={() => onSelect(l)}>
                  <div className="lc-name">{l.name}</div>
                  <div className="lc-meta">{fmtPhone(l.phone) || l.email || ''}{l.monto ? ` · ${money(l.monto)}` : ''}</div>
                  {multiOwner && l.owner_name && <div style={{ marginBottom: 6 }}><OwnerChip value={l.owner_name} small /></div>}
                  {f.tone !== 'closed' && <div style={{ marginBottom: 6 }}><span className={`follow-chip ${f.tone}`}>{f.tone === 'none' ? 'Sin seguimiento' : f.label}</span></div>}
                  <div className="lc-foot">
                    {l.canal && <CanalChip value={l.canal} small />}
                    <span className="lc-date">{fmtDate(l.fecha || l.created_at?.slice(0, 10) || '')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   SEGUIMIENTO — registrar actividad + historial
══════════════════════════════════════════════════════════ */
function ActivitiesTab({ lead, storeName, readonly, waModule, onPatched, toast }: {
  lead: any; storeName: string; readonly: boolean; waModule: boolean
  onPatched: (patch: Record<string, unknown>) => void
  toast: (m: string) => void
}) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading]       = useState(true)
  const [active, setActive]         = useState<AType | null>(null)
  const [form, setForm]             = useState({ description: '', amount: '', date: localNow() })
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [markQuoted, setMarkQuoted] = useState(true)
  const [useAsValue, setUseAsValue] = useState(true)
  const [quoteLink, setQuoteLink]   = useState<string | null>(null)
  const [quoteText, setQuoteText]   = useState('')
  const [sendingQuote, setSendingQuote] = useState(false)
  const [quoteSent, setQuoteSent]   = useState(false)
  const [nextStep, setNextStep]     = useState<AType | null>(null)   // tras registrar: ¿cuándo sigue?
  const windowOpen = useWhatsAppWindow(lead.phone, waModule)
  const descRef = useRef<HTMLTextAreaElement>(null)

  // Con la ventana de 24 h abierta, la cotización sale del número del negocio
  // y queda en la bandeja de WhatsApp del CRM.
  const sendQuoteFromCrm = async (text: string) => {
    setSendingQuote(true)
    try {
      const r = await fetch(`/api/whatsapp/conversations/${normalizePhone(lead.phone)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSaveError(d.error || 'No se pudo enviar por WhatsApp'); return }
      setQuoteSent(true)
      setQuoteLink(prev => prev ?? buildWhatsApp(lead.phone, lead.name, '', null, storeName))
    } finally { setSendingQuote(false) }
  }

  const loadActivities = useCallback(async () => {
    try {
      const r = await fetch(`/api/data/activities?lead_id=${lead.id}`)
      const d = await r.json()
      setActivities(d.activities || [])
    } catch {} finally { setLoading(false) }
  }, [lead.id])

  useEffect(() => { loadActivities() }, [loadActivities])
  useEffect(() => { if (active) setTimeout(() => descRef.current?.focus(), 60) }, [active])

  const resetForm = () => {
    setForm({ description: '', amount: '', date: localNow() })
    setMarkQuoted(true); setUseAsValue(true)
    setQuoteLink(null); setQuoteSent(false)
  }
  const selectType = (t: AType) => { setNextStep(null); if (active === t) { setActive(null); resetForm() } else { setActive(t); resetForm() } }

  const handleSave = async () => {
    if (!active) return
    setSaving(true); setSaveError('')
    try {
      const amount = form.amount ? Number(form.amount) : null
      const res = await fetch('/api/data/activities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id, type: active,
          description: form.description.trim() || null,
          amount, activity_date: new Date(form.date).toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.error || `Error ${res.status} al guardar la actividad`)
        return
      }

      // Una cotización actualiza el lead: etapa "Cotizado" y/o su valor
      if (active === 'quote') {
        const patch: Record<string, unknown> = {}
        if (markQuoted && lead.estado !== 'Cotizado' && isOpenLead(lead.estado)) patch.estado = 'Cotizado'
        if (useAsValue && amount && Number(lead.monto) !== amount) patch.monto = amount
        if (Object.keys(patch).length) {
          const r = await fetch(`/api/data/leads/${lead.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
          })
          if (r.ok) onPatched(patch)
        }
        if (lead.phone) {
          setQuoteLink(buildWhatsApp(lead.phone, lead.name, form.description, amount, storeName))
          setQuoteText(buildQuoteText(lead.name, form.description, amount, storeName))
          setQuoteSent(false)
        }
      }

      await loadActivities()
      notifyDataChanged('activity')
      // Si el lead sigue abierto, proponer el siguiente seguimiento
      if (isOpenLead(lead.estado)) setNextStep(active)
      setActive(null)
      setForm({ description: '', amount: '', date: localNow() })
    } catch {
      setSaveError('Error de conexión al guardar la actividad')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    const r = await fetch(`/api/data/activities/${id}`, { method: 'DELETE' })
    if (r.ok) { setActivities(prev => prev.filter(a => a.id !== id)); notifyDataChanged('activity') }
  }

  const scheduleNext = async (when: QuickWhen) => {
    const t = getAType(nextStep ?? 'note')
    const r = await fetch('/api/data/reminders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: lead.id, lead_name: lead.name, type: t.next, priority: 'medium',
        nota: nextStep === 'quote' ? `Preguntar por la cotización a ${firstName(lead.name)}` : `Dar seguimiento a ${firstName(lead.name)}`,
        fecha_recordatorio: toDbLocal(quickDate(when)),
      }),
    })
    if (r.ok) { setNextStep(null); notifyDataChanged('reminder'); toast('Seguimiento programado') }
    else toast('No se pudo programar el seguimiento')
  }

  return (
    <div>
      {!readonly && (
        <div style={{ marginBottom: 16 }}>
          <div className="mini-label">Registrar lo que pasó</div>
          <div className="pill-group">
            {ACTIVITY_TYPES.map(t => (
              <button key={t.key} onClick={() => selectType(t.key)} className={`choice-pill ${active === t.key ? 'active' : ''}`}
                style={{ '--pill-color': t.color, '--pill-bg': t.bg } as React.CSSProperties}>
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Formulario ── */}
      {active && (
        <div className="activity-form" style={{ borderColor: getAType(active).color, boxShadow: `0 0 0 3px ${getAType(active).bg}` }}>
          <div className="activity-form-title" style={{ color: getAType(active).color }}>
            {getAType(active).emoji} Registrar {getAType(active).label.toLowerCase()}
          </div>

          {active === 'quote' && (
            <div className="field">
              <label>Monto cotizado (MXN)</label>
              <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" inputMode="decimal" style={{ fontWeight: 600 }} />
            </div>
          )}

          <div className="field">
            <label>{active === 'quote' ? 'Productos y cantidades' : '¿Qué pasó? (opcional)'}</label>
            <textarea ref={descRef} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={active === 'quote' ? 'Ej. 20 cubetas vinílica blanco mate, 5 sellador…' : 'Ej. Le interesa, pidió muestra de color…'}
              rows={active === 'quote' ? 3 : 2} />
          </div>

          <div className="field">
            <label>Fecha y hora</label>
            <input type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} max={localNow()} />
          </div>

          {active === 'quote' && (
            <div className="check-list">
              {lead.estado !== 'Cotizado' && isOpenLead(lead.estado) && (
                <label><input type="checkbox" checked={markQuoted} onChange={e => setMarkQuoted(e.target.checked)} /> Mover el lead a <strong>Cotizado</strong></label>
              )}
              {!!form.amount && Number(form.amount) !== Number(lead.monto) && (
                <label><input type="checkbox" checked={useAsValue} onChange={e => setUseAsValue(e.target.checked)} /> Usar {money(form.amount)} como valor del lead</label>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setActive(null); resetForm() }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
              {saving ? 'Guardando…' : <><Ico.send /> Guardar</>}
            </button>
          </div>
          {saveError && <div className="field-error" style={{ marginTop: 8 }}>{saveError}</div>}
        </div>
      )}

      {!active && saveError && <div className="field-error" style={{ marginBottom: 12 }}>{saveError}</div>}

      {/* ── ¿Cuándo es el siguiente paso? ── */}
      {nextStep && !readonly && (
        <div className="next-step">
          <div className="next-step-title">✓ Registrado. ¿Cuándo vuelves a contactar a {firstName(lead.name)}?</div>
          <div className="pill-group">
            {QUICK_WHEN.filter(w => w.key !== '1h').map(w => (
              <button key={w.key} className="quick-chip" onClick={() => scheduleNext(w.key)}>{w.label}</button>
            ))}
            <button className="quick-chip" onClick={() => {
              setNextStep(null)
              openQuickCreate({ kind: 'reminder', defaults: { lead_id: lead.id, lead_name: lead.name, type: getAType(nextStep).next as ReminderType, nota: `Dar seguimiento a ${firstName(lead.name)}` } })
            }}>Otra fecha…</button>
            <button className="link-btn muted" onClick={() => setNextStep(null)}>Ahora no</button>
          </div>
        </div>
      )}

      {/* ── Compartir la cotización por WhatsApp ── */}
      {quoteLink && (
        <div className="quote-share">
          <span style={{ fontSize: 20 }}>💬</span>
          <div style={{ flex: '1 1 180px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 2 }}>{quoteSent ? 'Cotización enviada por WhatsApp ✓' : 'Cotización registrada'}</div>
            <div style={{ fontSize: 12, color: 'var(--success)' }}>
              {quoteSent ? 'Quedó en la bandeja de WhatsApp del CRM.'
                : windowOpen ? 'El cliente escribió en las últimas 24 h: puedes enviarla desde el número del negocio.'
                : 'Compártela por WhatsApp.'}
            </div>
          </div>
          {!quoteSent && windowOpen && (
            <button onClick={() => sendQuoteFromCrm(quoteText)} disabled={sendingQuote} className="btn" style={{ background: '#1B9E4B', color: '#fff' }}>
              <Ico.send /> {sendingQuote ? 'Enviando…' : 'Enviar desde el CRM'}
            </button>
          )}
          {!quoteSent && (
            <a href={quoteLink} target="_blank" rel="noopener noreferrer" className="btn" style={windowOpen ? { border: '1px solid #86EFAC', color: '#1F5536' } : { background: '#25D366', color: '#fff' }}>
              <Ico.whatsapp /> Abrir WhatsApp
            </a>
          )}
          <button onClick={() => setQuoteLink(null)} aria-label="Cerrar" style={{ color: 'var(--success)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Historial ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 20, height: 20, border: '2.5px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : activities.length === 0 ? (
        <div className="empty-state small">
          <div style={{ fontSize: 26, marginBottom: 6, opacity: 0.45 }}>📋</div>
          Aún no hay seguimiento registrado.
          {!readonly && <div style={{ fontSize: 12, marginTop: 4 }}>Cada llamada, cotización o visita que registres queda aquí.</div>}
        </div>
      ) : (
        <div>
          <div className="mini-label">Historial · {activities.length}</div>
          <div className="timeline">
            {activities.map(a => {
              const t = getAType(a.type)
              return (
                <div key={a.id} className="timeline-item">
                  <div className="timeline-dot" style={{ background: t.bg, borderColor: t.color }}>{t.emoji}</div>
                  <div className="timeline-card">
                    <div className="timeline-top">
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.color }}>{t.label}</span>
                      {a.amount ? <span className="timeline-amount">{money(a.amount)}</span> : null}
                      <span className="timeline-when">{fmtAgo(a.activity_date)}</span>
                    </div>
                    {a.description && <div className="timeline-text">{a.description}</div>}
                    <div className="timeline-actions">
                      {a.type === 'quote' && lead.phone && (windowOpen ? (
                        <button onClick={() => sendQuoteFromCrm(buildQuoteText(lead.name, a.description || '', a.amount, storeName))} disabled={sendingQuote} className="timeline-wa">
                          <Ico.whatsapp /> {sendingQuote ? 'Enviando…' : 'Reenviar desde el CRM'}
                        </button>
                      ) : (
                        <a href={buildWhatsApp(lead.phone, lead.name, a.description || '', a.amount, storeName)} target="_blank" rel="noopener noreferrer" className="timeline-wa">
                          <Ico.whatsapp /> Reenviar por WhatsApp
                        </a>
                      ))}
                      {!readonly && <button onClick={() => handleDelete(a.id)} className="timeline-del" title="Eliminar">Eliminar</button>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   RECORDATORIOS DEL LEAD
══════════════════════════════════════════════════════════ */
function RemindersTab({ lead, readonly, onCount }: { lead: any; readonly: boolean; onCount: (n: number) => void }) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  const now = new Date()

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/data/reminders?lead_id=${lead.id}`)
      const d = await r.json()
      setReminders(d.reminders || [])
    } catch { setReminders([]) }
  }, [lead.id])

  useEffect(() => { load() }, [load])
  useDataChanged(['reminder'], load)

  const pending   = (reminders ?? []).filter(r => !r.completado).sort((a, b) => a.fecha_recordatorio.localeCompare(b.fecha_recordatorio))
  const completed = (reminders ?? []).filter(r => r.completado)
  useEffect(() => { if (reminders) onCount(pending.length) }, [reminders, pending.length, onCount])

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/data/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) notifyDataChanged('reminder')
  }
  const remove = async (id: string) => {
    const r = await fetch(`/api/data/reminders/${id}`, { method: 'DELETE' })
    if (r.ok) notifyDataChanged('reminder')
  }

  return (
    <div>
      {!readonly && (
        <button className="btn btn-ghost btn-block" style={{ marginBottom: 14 }}
          onClick={() => openQuickCreate({ kind: 'reminder', defaults: { lead_id: lead.id, lead_name: lead.name, type: 'call', nota: `Dar seguimiento a ${firstName(lead.name)}` } })}>
          <Ico.plus /> Programar seguimiento
        </button>
      )}

      {reminders === null ? null : pending.length === 0 ? (
        <div className="empty-state small">Sin recordatorios pendientes para este lead.</div>
      ) : pending.map(r => {
        const overdue = isOverdue(r.fecha_recordatorio, now)
        const info = remTypeInfo(r.type)
        return (
          <div key={r.id} className={`rem-row ${overdue ? 'overdue' : ''}`}>
            <span style={{ fontSize: 15 }} aria-hidden="true">{info.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rem-row-when">{fmtDue(r.fecha_recordatorio, now)}</div>
              <div className="rem-row-text">{reminderTitle(r)}</div>
              {r.mine === false && <div className="rem-row-owner">De {r.owner_name}</div>}
            </div>
            {!readonly && r.mine !== false && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="icon-btn icon-btn-edit" title="Editar" onClick={() => openQuickCreate({ kind: 'reminder', reminder: r })}><Ico.edit /></button>
                <button className="icon-btn icon-btn-delete" title="Eliminar" onClick={() => remove(r.id)}><Ico.trash /></button>
                <button className="notif-done" onClick={() => patch(r.id, { completado: true })}>✓ Listo</button>
              </div>
            )}
          </div>
        )
      })}

      {completed.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="details-summary">{completed.length} completado{completed.length !== 1 ? 's' : ''}</summary>
          {completed.map(r => (
            <div key={r.id} className="rem-row done">
              <span>✓</span>
              <span style={{ flex: 1 }}>{reminderTitle(r)}{r.mine === false ? ` · ${r.owner_name}` : ''}</span>
              <span className="cell-muted">{fmtDateLong(String(r.completado_at || r.fecha_recordatorio).slice(0, 10))}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   FICHA DEL LEAD
══════════════════════════════════════════════════════════ */
function LeadDetail({
  lead, isAdmin, readonly, storeName, waModule,
  onClose, onChangeEstado, onPatched, onDeleted, toast,
}: {
  lead: any; isAdmin: boolean; readonly: boolean; storeName: string; waModule: boolean
  onClose: () => void; onChangeEstado: (id: string, e: string) => void
  onPatched: (patch: Record<string, unknown>) => void; onDeleted: (id: string) => void
  toast: (m: string) => void
}) {
  type DTab = 'seguimiento' | 'recordatorios' | 'datos'
  const { segments, canales } = useCatalogs()
  const [tab, setTab]           = useState<DTab>('seguimiento')
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [editing, setEditing]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editForm, setEditForm] = useState({
    canal: lead.canal || '', segmento: lead.segmento || '',
    monto: lead.monto ? String(lead.monto) : '', fecha: lead.fecha || lead.created_at?.slice(0, 10) || '',
    notas: lead.notas || '',
  })
  const phone = normalizePhone(lead.phone)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleSaveLead = async () => {
    setSaving(true); setSaveError('')
    try {
      const body = { ...editForm, monto: editForm.monto ? Number(editForm.monto) : null, notas: editForm.notas.trim() || null }
      const r = await fetch(`/api/data/leads/${lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const upd = await r.json().catch(() => ({}))
      if (!r.ok) { setSaveError(upd.error || 'No se pudieron guardar los cambios'); return }
      onPatched(body)
      setEditing(false)
      toast('Lead actualizado')
    } finally { setSaving(false) }
  }

  const handleDeleteLead = async () => {
    setDeleting(true)
    const r = await fetch(`/api/data/leads/${lead.id}`, { method: 'DELETE' })
    if (r.ok) onDeleted(lead.id)
    else { setDeleting(false); toast('No se pudo eliminar el lead') }
  }

  const TABS_D: { key: DTab; label: string; icon: () => React.ReactElement; count?: number | null }[] = [
    { key: 'seguimiento',   label: 'Seguimiento',   icon: Ico.history },
    { key: 'recordatorios', label: 'Recordatorios', icon: Ico.bell, count: pendingCount },
    { key: 'datos',         label: 'Datos',         icon: Ico.info },
  ]
  const opt = (list: string[], current: string) => current && !list.includes(current) ? [current, ...list] : list

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail" aria-label={`Lead ${lead.name}`}>

        {/* ── Cabecera ── */}
        <div className="detail-head">
          <button className="detail-close" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
          <div className="detail-kicker">Lead{lead.owner_name && isAdmin ? ` · ${lead.owner_name}` : ''}</div>
          <div className="detail-title">{lead.name}</div>
          <div className="detail-meta">
            {lead.segmento && <SegmentoChip value={lead.segmento} small />}
            {lead.canal && <CanalChip value={lead.canal} small />}
            {lead.contact_id && <Link href={`/contactos?id=${lead.contact_id}`} className="detail-link"><Ico.user /> Ver cliente</Link>}
            {lead.monto ? <span className="detail-amount">{money(lead.monto)}</span> : null}
          </div>
          {/* Etapa: siempre a la vista */}
          <div className="stage-bar" role="radiogroup" aria-label="Etapa del lead">
            {ESTADOS.map(e => (
              <button key={e} role="radio" aria-checked={lead.estado === e} disabled={readonly}
                className={`stage ${lead.estado === e ? 'active' : ''}`} onClick={() => lead.estado !== e && onChangeEstado(lead.id, e)}
                style={{ '--stage-color': ESTADO_COLORS[e] } as React.CSSProperties}>
                <span className="stage-dot" />{e === WON ? 'Ganado' : e}
              </button>
            ))}
          </div>
        </div>

        {/* ── Pestañas ── */}
        <div className="detail-tabs" role="tablist">
          {TABS_D.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`detail-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => { setTab(t.key); setEditing(false); setConfirmDel(false) }}>
              <t.icon /> {t.label}
              {!!t.count && <span className="detail-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* ── Cuerpo ── */}
        <div className="detail-body">
          {tab === 'seguimiento' && (
            <ActivitiesTab lead={lead} storeName={storeName} readonly={readonly} waModule={waModule} onPatched={onPatched} toast={toast} />
          )}

          {/* Montado siempre para conocer el número de pendientes */}
          <div hidden={tab !== 'recordatorios'}>
            <RemindersTab lead={lead} readonly={readonly} onCount={setPendingCount} />
          </div>

          {tab === 'datos' && (
            editing ? (
              <div className="detail-section">
                <h4>Editar lead</h4>
                <div className="field-row">
                  <div className="field">
                    <label>Canal</label>
                    <select value={editForm.canal} onChange={e => setEditForm(f => ({ ...f, canal: e.target.value }))}>
                      {opt(canales, editForm.canal).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Segmento</label>
                    <select value={editForm.segmento} onChange={e => setEditForm(f => ({ ...f, segmento: e.target.value }))}>
                      {opt(segments, editForm.segmento).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Valor estimado (MXN)</label>
                    <input type="number" min="0" value={editForm.monto} onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" inputMode="decimal" />
                  </div>
                  <div className="field">
                    <label>Fecha</label>
                    <input type="date" value={editForm.fecha} onChange={e => setEditForm(f => ({ ...f, fecha: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Notas</label>
                  <textarea value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={4} />
                </div>
                {saveError && <div className="field-error" style={{ marginBottom: 8 }}>{saveError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleSaveLead} disabled={saving} style={{ flex: 1 }}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="detail-section">
                  <div className="detail-section-head">
                    <h4>Datos del lead</h4>
                    {!readonly && <button className="link-btn" onClick={() => { setEditing(true); setConfirmDel(false) }}><Ico.edit /> Editar</button>}
                  </div>
                  <div className="kv-grid">
                    <div className="kv"><div className="k">Teléfono</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPhone(lead.phone) || '—'}</div></div>
                    <div className="kv"><div className="k">Correo</div><div className="v" style={{ fontSize: 13 }}>{lead.email || '—'}</div></div>
                    <div className="kv"><div className="k">Valor estimado</div><div className="v">{lead.monto ? money(lead.monto) : '—'}</div></div>
                    <div className="kv"><div className="k">Fecha</div><div className="v">{fmtDateLong(lead.fecha || lead.created_at?.slice(0, 10) || '')}</div></div>
                    <div className="kv"><div className="k">Canal</div><div className="v">{lead.canal || '—'}</div></div>
                    <div className="kv"><div className="k">Segmento</div><div className="v">{lead.segmento || '—'}</div></div>
                  </div>
                </div>
                <div className="detail-section">
                  <h4>Notas</h4>
                  {lead.notas ? <div className="notes-box">{lead.notas}</div> : <div className="empty-state small" style={{ textAlign: 'left', padding: 0 }}>Sin notas.</div>}
                </div>
                {!readonly && (
                  confirmDel ? (
                    <div className="danger-box">
                      <div className="danger-title">¿Eliminar este lead?</div>
                      <div className="danger-text">Se eliminará junto con su historial y sus recordatorios. No se puede deshacer.</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} style={{ flex: 1 }}>Cancelar</button>
                        <button className="btn btn-danger" onClick={handleDeleteLead} disabled={deleting} style={{ flex: 1 }}>{deleting ? 'Eliminando…' : 'Sí, eliminar'}</button>
                      </div>
                    </div>
                  ) : (
                    <button className="link-btn danger" onClick={() => setConfirmDel(true)}><Ico.trash /> Eliminar lead</button>
                  )
                )}
              </>
            )
          )}
        </div>

        {/* ── Contactar ── */}
        {(lead.phone || lead.email) && (
          <div className="detail-foot">
            {lead.phone && <a href={`tel:${phone || lead.phone}`} className="btn btn-ghost btn-ghost-call"><Ico.phone /> Llamar</a>}
            {waModule && phone.length === 10 && (
              <Link href={`/whatsapp?phone=${phone}`} className="btn btn-ghost btn-ghost-whatsapp"><Ico.whatsapp /> WhatsApp</Link>
            )}
            {lead.email && <a href={`mailto:${lead.email}`} className="btn btn-ghost btn-ghost-mail"><Ico.mail /> Correo</a>}
          </div>
        )}
      </aside>
    </>
  )
}
