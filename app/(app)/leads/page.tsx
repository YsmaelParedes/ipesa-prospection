'use client'

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Avatar, CanalChip, EstadoChip, SegmentoChip, OwnerChip, FilterDropdown, fmtDate, fmtDateLong, fmtPhone, normalizePhone } from '@/components/CrmUI'
import { getUserRole, useSession } from '@/lib/profile'

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
const ESTADOS          = ['Nuevo', 'En seguimiento', 'Cotizado', 'Ganado / Venta realizada', 'Perdido']
const CANALES_DEFAULT  = ['Referido', 'Visita a Tienda', 'WhatsApp', 'Redes Sociales', 'Campaña Pagada', 'Otro']
const SEGMENTOS_DEFAULT= ['Constructor', 'Arquitecto', 'Hogar', 'Empresa']

const ACTIVITY_TYPES = [
  { key: 'call',     label: 'Llamada',    emoji: '📞', color: 'var(--c-cyan-ink)',    bg: 'var(--c-cyan-soft)' },
  { key: 'email',    label: 'Correo',     emoji: '📧', color: 'var(--c-magenta-ink)', bg: 'var(--c-magenta-soft)' },
  { key: 'whatsapp', label: 'WhatsApp',   emoji: '💬', color: '#128C4A',              bg: '#E3F7EA' },
  { key: 'quote',    label: 'Cotización', emoji: '📋', color: 'var(--warning)',       bg: 'var(--warning-soft)' },
  { key: 'meeting',  label: 'Reunión',    emoji: '🤝', color: 'var(--c-purple-ink)',  bg: 'var(--c-purple-soft)' },
  { key: 'visit',    label: 'Visita',     emoji: '🏪', color: 'var(--c-teal-ink)',    bg: 'var(--c-teal-soft)' },
  { key: 'note',     label: 'Nota',       emoji: '📝', color: 'var(--muted)',         bg: 'var(--paper-2)' },
] as const
type AType = typeof ACTIVITY_TYPES[number]['key']

type Activity = {
  id: string; lead_id: string; user_id: string
  type: AType; description: string | null; amount: number | null
  activity_date: string; created_at: string
}

type Reminder = {
  id: string; lead_id: string | null; lead_name: string
  nota: string; fecha_recordatorio: string; completado: boolean
  completado_at: string | null; type?: string; priority?: string
}

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
const MESES   = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const pad     = (n: number) => String(n).padStart(2, '0')
const localNow= () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

function fmtDt(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (diff < 60_000) return 'Ahora mismo'
  if (diff < 3_600_000) return `Hace ${Math.floor(diff/60_000)} min`
  if (diff < 86_400_000) return `Hoy · ${time}`
  if (days === 1) return `Ayer · ${time}`
  if (days < 7) return `Hace ${days} días · ${time}`
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''} · ${time}`
}

function fmtRemDate(iso: string) {
  const d = new Date(iso)
  const now = new Date(), diff = d.getTime() - now.getTime()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (Math.abs(diff) <= 45_000) return '¡Ahora!'
  const mins = Math.floor(Math.abs(diff)/60_000)
  if (Math.abs(diff) < 2*3_600_000) return diff > 0 ? `En ${mins} min` : `Hace ${mins} min`
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, now)) return `Hoy · ${time}`
  if (diff < 0) return `Vencido · ${d.getDate()} ${MESES[d.getMonth()]}`
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${time}`
}

function getAType(key: string) { return ACTIVITY_TYPES.find(t => t.key === key) ?? ACTIVITY_TYPES[6] }

function buildQuoteText(name: string, description: string, amount: number | null, storeName: string) {
  return [
    `Hola ${name}, te comparto la cotización de ${storeName}:`,
    '',
    description || '(Descripción de la cotización)',
    ...(amount ? ['', `💰 Total: $${Number(amount).toLocaleString('es-MX')} MXN`] : []),
    '',
    '¿Tienes alguna pregunta? Estamos a tus órdenes. 🎨',
  ].join('\n')
}

function buildWhatsApp(phone: string, name: string, description: string, amount: number | null, storeName: string) {
  return `https://wa.me/52${normalizePhone(phone)}?text=${encodeURIComponent(buildQuoteText(name, description, amount, storeName))}`
}

/** ¿Está abierta la ventana de 24 h con este número? (para enviar desde el número del negocio) */
function useWhatsAppWindow(phone: string | null | undefined) {
  const [open, setOpen] = useState(false)
  const p = normalizePhone(phone || '')
  useEffect(() => {
    if (p.length !== 10) return
    fetch(`/api/whatsapp/conversations/${p}?preview=1&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setOpen(!!d?.windowOpen))
      .catch(() => {})
  }, [p])
  return p.length === 10 && open
}

/* ══════════════════════════════════════════════════════════
   ICONOS
══════════════════════════════════════════════════════════ */
const Ico = {
  close:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  plus:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  contacts: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  phone:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  table:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
  kanban:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/></svg>,
  chevron:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><path d="m9 18 6-6-6-6"/></svg>,
  check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--warning-fill)' }}><path d="m5 13 4 4L19 7"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  clock:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  edit:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  search:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)' }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  history:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>,
  bell:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  info:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  send:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>,
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
  const [leads, setLeads]           = useState<any[]>([])
  const [canales, setCanales]       = useState<string[]>(CANALES_DEFAULT)
  const [segmentos, setSegmentos]   = useState<string[]>(SEGMENTOS_DEFAULT)
  const [configCanales, setConfigCanales]     = useState<string[]>(CANALES_DEFAULT)
  const [configSegmentos, setConfigSegmentos] = useState<string[]>(SEGMENTOS_DEFAULT)
  const [view, setView]             = useState<'tabla'|'kanban'>('tabla')
  const [canalF, setCanalF]         = useState('Todos')
  const [segF, setSegF]             = useState('Todos')
  const [estadoF, setEstadoF]       = useState('Todos')
  const [ownerF, setOwnerF]         = useState('Todos')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<any | null>(null)
  const [toast, setToast]           = useState('')
  const [isAdmin, setIsAdmin]       = useState(false)

  useEffect(() => { getUserRole().then(r => setIsAdmin(r === 'admin')) }, [])

  /* ── Crear lead desde contacto ── */
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [leadFromContact,   setLeadFromContact]   = useState<any | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  useEffect(() => {
    // Paralelo: ambas requests de config al mismo tiempo
    Promise.allSettled([
      fetch('/api/data/config?type=canal').then(r => r.json()),
      fetch('/api/data/config?type=segment').then(r => r.json()),
    ]).then(([canal, seg]) => {
      if (canal.status === 'fulfilled' && canal.value.items?.length)
        setConfigCanales(canal.value.items.map((i: any) => i.label))
      if (seg.status === 'fulfilled' && seg.value.items?.length)
        setConfigSegmentos(seg.value.items.map((i: any) => i.label))
    })
  }, [])

  useEffect(() => {
    const h = (e: Event) => setSearch((e as CustomEvent).detail ?? '')
    window.addEventListener('crm:search', h)
    return () => window.removeEventListener('crm:search', h)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/data/leads')
      const d = await r.json()
      const list: any[] = d.leads || []
      setLeads(list)
      setCanales(Array.from(new Set(list.map((l: any) => l.canal).filter(Boolean))) as string[])
      setSegmentos(Array.from(new Set(list.map((l: any) => l.segmento).filter(Boolean))) as string[])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  /* Abrir el lead indicado en la URL (?id=…), p. ej. desde WhatsApp o Contactos */
  useEffect(() => {
    if (!deepId || loading) return
    const found = leads.find(l => l.id === deepId)
    if (found) setSelected(found)
  }, [deepId, loading, leads])

  const closeDetail = () => {
    setSelected(null)
    if (deepId) router.replace('/leads', { scroll: false })
  }

  const owners = useMemo(() => Array.from(new Set(leads.map(l => l.owner_name).filter(Boolean))) as string[], [leads])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter(l => {
      if (canalF  !== 'Todos' && l.canal    !== canalF)  return false
      if (segF    !== 'Todos' && l.segmento !== segF)    return false
      if (estadoF !== 'Todos' && l.estado   !== estadoF) return false
      if (ownerF  !== 'Todos' && l.owner_name !== ownerF) return false
      if (q && !`${l.name} ${l.phone||''} ${l.email||''} ${l.canal||''} ${l.segmento||''} ${l.estado||''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [leads, canalF, segF, estadoF, ownerF, search])

  const updateEstado = async (id: string, estado: string) => {
    const r = await fetch(`/api/data/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    if (!r.ok) { showToast('No se pudo cambiar el estado'); return }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, estado } : l))
    if (selected?.id === id) setSelected((s: any) => ({ ...s, estado }))
    showToast(`Estado → "${estado}"`)
  }

  return (
    <>
      <div className="section-head">
        <h2>Pipeline de leads</h2>
        <span className="count">{filtered.length} de {leads.length}</span>
        {isAdmin && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-cyan-ink)', background: 'var(--c-cyan-soft)', borderRadius: 20, padding: '3px 10px' }}>
            👁 Vista de administrador · todos los usuarios
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => setShowContactPicker(true)}>
            <Ico.contacts /> Nuevo Lead
          </button>
          <div className="view-toggle">
            <button className={view === 'tabla'  ? 'active' : ''} onClick={() => setView('tabla')} ><Ico.table />  Tabla</button>
            <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><Ico.kanban /> Kanban</button>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <FilterDropdown value={canalF}  options={canales}   onChange={setCanalF}  triggerLabel={v => `Canal: ${v}`}    optionLabel={v => v} searchPlaceholder="Buscar canal…" />
        <FilterDropdown value={segF}    options={segmentos} onChange={setSegF}    triggerLabel={v => `Segmento: ${v}`} optionLabel={v => v} searchPlaceholder="Buscar segmento…" />
        <FilterDropdown value={estadoF} options={ESTADOS}   onChange={setEstadoF} triggerLabel={v => `Estado: ${v}`}   optionLabel={v => v} searchPlaceholder="Buscar estado…" searchable={false} />
        {isAdmin && owners.length > 1 && (
          <FilterDropdown value={ownerF} options={owners} onChange={setOwnerF} triggerLabel={v => `Vendedor: ${v}`} optionLabel={v => v} searchPlaceholder="Buscar vendedor…" />
        )}
        {(canalF !== 'Todos' || segF !== 'Todos' || estadoF !== 'Todos' || ownerF !== 'Todos') && (
          <button className="filter-pill" onClick={() => { setCanalF('Todos'); setSegF('Todos'); setEstadoF('Todos'); setOwnerF('Todos') }}>Limpiar filtros</button>
        )}
        <div style={{ marginLeft: 'auto' }} className="search-input">
          <Ico.search />
          <input placeholder="Buscar lead…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 13 }}>
          {canalF !== 'Todos' || segF !== 'Todos' || estadoF !== 'Todos' || search
            ? 'Sin resultados para estos filtros.'
            : <>Sin leads aún · <Link href="/contactos" style={{ color: 'var(--brand)', fontWeight: 600 }}>Crear desde un contacto →</Link></>}
        </div>
      ) : view === 'tabla' ? (
        <LeadsTable leads={filtered} onSelect={setSelected} isAdmin={isAdmin} />
      ) : (
        <LeadsKanban leads={filtered} onSelect={setSelected} isAdmin={isAdmin} />
      )}

      {selected && (
        <LeadDetail
          lead={selected}
          configCanales={configCanales}
          configSegmentos={configSegmentos}
          key={selected.id}
          onClose={closeDetail}
          onChangeEstado={updateEstado}
          onUpdated={upd => { setLeads(prev => prev.map(l => l.id === upd.id ? upd : l)); setSelected(upd); showToast('Lead actualizado ✓') }}
          onDeleted={id  => { setLeads(prev => prev.filter(l => l.id !== id)); closeDetail(); showToast('Lead eliminado') }}
        />
      )}

      {/* ── Seleccionar contacto para crear lead ── */}
      {showContactPicker && (
        <ContactPickerModal
          onClose={() => setShowContactPicker(false)}
          onSelect={c => { setShowContactPicker(false); setLeadFromContact(c) }}
        />
      )}

      {/* ── Formulario de lead pre-llenado desde contacto ── */}
      {leadFromContact && (
        <LeadFromContactModal
          contact={leadFromContact}
          canales={configCanales}
          segmentos={configSegmentos}
          onClose={() => setLeadFromContact(null)}
          onSaved={() => { setLeadFromContact(null); load(); showToast('Lead creado ✓') }}
        />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}

/* ══════════════════════════════════════════════════════════
   COMPONENTES AUXILIARES
══════════════════════════════════════════════════════════ */
function LeadsTable({ leads, onSelect, isAdmin }: { leads: any[]; onSelect: (l: any) => void; isAdmin?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Lead</th><th>Canal</th><th>Segmento</th><th>Estado</th>
            <th style={{ textAlign: 'right' }}>Valor est.</th>
            <th style={{ textAlign: 'right' }}>Fecha</th>
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
                    <div className="nm" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div className="em">{fmtPhone(l.phone) || l.email || ''}</div>
                    {isAdmin && l.owner_name && (
                      <div style={{ marginTop: 3 }}><OwnerChip value={l.owner_name} small /></div>
                    )}
                  </div>
                </div>
              </td>
              <td data-label="Canal"><CanalChip value={l.canal || '—'} /></td>
              <td data-label="Segmento"><SegmentoChip value={l.segmento || '—'} /></td>
              <td data-label="Estado"><EstadoChip value={l.estado || '—'} /></td>
              <td data-label="Valor" className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                {l.monto ? `$${Number(l.monto).toLocaleString('es-MX')}` : '—'}
              </td>
              <td data-label="Fecha" className="cell-muted" style={{ textAlign: 'right' }}>{fmtDate(l.fecha || l.created_at?.slice(0,10) || '')}</td>
              <td className="cell-chevron" style={{ width: 40, textAlign: 'right' }}><Ico.chevron /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LeadsKanban({ leads, onSelect, isAdmin }: { leads: any[]; onSelect: (l: any) => void; isAdmin?: boolean }) {
  return (
    <div className="kanban">
      {ESTADOS.map(estado => {
        const col = leads.filter(l => l.estado === estado)
        const valor = col.reduce((s, l) => s + (Number(l.monto) || 0), 0)
        return (
          <div className="kanban-col" key={estado}>
            <div className="kanban-head">
              <EstadoChip value={estado} small />
              <span className="kcount">{col.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '0 2px 6px', fontWeight: 500 }}>
              {valor > 0 ? `$${valor.toLocaleString('es-MX')} potencial` : 'Sin valor cotizado'}
            </div>
            {col.map(l => (
              <div className="lead-card" key={l.id} onClick={() => onSelect(l)}>
                <div className="lc-name">{l.name}</div>
                <div className="lc-meta">{fmtPhone(l.phone) || l.email || ''}</div>
                {isAdmin && l.owner_name && (
                  <div style={{ marginBottom: 4 }}><OwnerChip value={l.owner_name} small /></div>
                )}
                <div style={{ display: 'flex', gap: 4 }}><CanalChip value={l.canal || '—'} small /></div>
                <div className="lc-foot">
                  <SegmentoChip value={l.segmento || '—'} small />
                  <span className="lc-date">{fmtDate(l.fecha || l.created_at?.slice(0,10) || '')}</span>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   PANEL DE ACTIVIDADES — HISTORIAL + FORMULARIO RÁPIDO
══════════════════════════════════════════════════════════ */
function ActivitiesTab({ lead, onEstadoUpdate }: {
  lead: any
  onEstadoUpdate: (estado: string) => void
}) {
  const storeName = useSession()?.store?.name || 'nuestra tienda'
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading]       = useState(true)
  const [active, setActive]         = useState<AType | null>(null)
  const [form, setForm]             = useState({ description: '', amount: '', date: localNow() })
  const [saving, setSaving]         = useState(false)
  const [updateEstado, setUpdateEstado] = useState(true)
  const [quoteLink, setQuoteLink]   = useState<string | null>(null)
  const [quoteText, setQuoteText]   = useState('')
  const [sendingQuote, setSendingQuote] = useState(false)
  const [quoteSent, setQuoteSent]   = useState(false)
  const windowOpen = useWhatsAppWindow(lead.phone)
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
    setLoading(true)
    try {
      const r = await fetch(`/api/data/activities?lead_id=${lead.id}`)
      const d = await r.json()
      setActivities(d.activities || [])
    } catch {} finally { setLoading(false) }
  }, [lead.id])

  useEffect(() => { loadActivities() }, [loadActivities])

  useEffect(() => {
    if (active) { setTimeout(() => descRef.current?.focus(), 60) }
  }, [active])

  const resetForm = () => {
    setForm({ description: '', amount: '', date: localNow() })
    setUpdateEstado(true)
    setQuoteLink(null)
    setQuoteSent(false)
  }

  const selectType = (t: AType) => {
    if (active === t) { setActive(null); resetForm() } else { setActive(t); resetForm() }
  }

  const [saveError, setSaveError] = useState('')

  const handleSave = async () => {
    if (!active) return
    setSaving(true)
    setSaveError('')
    try {
      const payload: any = {
        lead_id:       lead.id,
        type:          active,
        description:   form.description.trim() || null,
        amount:        form.amount ? Number(form.amount) : null,
        activity_date: new Date(form.date).toISOString(),
      }
      const res = await fetch('/api/data/activities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.error || `Error ${res.status} al guardar actividad`)
        return
      }

      // Para cotizaciones: actualizar estado si se marcó la opción
      if (active === 'quote' && updateEstado && lead.estado !== 'Cotizado') {
        await fetch(`/api/data/leads/${lead.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'Cotizado' }),
        })
        onEstadoUpdate('Cotizado')
      }

      // Compartir la cotización por WhatsApp
      if (active === 'quote' && lead.phone) {
        const amount = form.amount ? Number(form.amount) : null
        setQuoteLink(buildWhatsApp(lead.phone, lead.name, form.description, amount, storeName))
        setQuoteText(buildQuoteText(lead.name, form.description, amount, storeName))
        setQuoteSent(false)
      }

      await loadActivities()
      setActive(null)
      setForm({ description: '', amount: '', date: localNow() })
    } catch {
      setSaveError('Error de conexión al guardar actividad')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/data/activities/${id}`, { method: 'DELETE' })
    setActivities(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div>
      {/* ── Botones de acción rápida ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          Registrar actividad
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {ACTIVITY_TYPES.map(t => (
            <button key={t.key} onClick={() => selectType(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', border: '2px solid',
                borderColor: active === t.key ? t.color : 'var(--line)',
                background:  active === t.key ? t.bg   : 'transparent',
                color:       active === t.key ? t.color : 'var(--ink-2)',
                transition: 'all 0.12s',
              }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Formulario inline ── */}
      {active && (
        <div style={{
          background: 'var(--paper)', border: `1px solid ${getAType(active).color}`,
          borderRadius: 12, padding: '14px 16px', marginBottom: 18,
          boxShadow: `0 0 0 3px ${getAType(active).bg}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>{getAType(active).emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: getAType(active).color }}>
              Registrar {getAType(active).label}
            </span>
          </div>

          {/* Fecha */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Fecha y hora</label>
            <input type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} max={localNow()}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--card)', boxSizing: 'border-box' }} />
          </div>

          {/* Monto (solo cotizaciones) */}
          {active === 'quote' && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Monto cotizado (MXN)
              </label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" inputMode="decimal"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5, outline: 'none', background: 'var(--card)', fontWeight: 600, boxSizing: 'border-box' }} />
            </div>
          )}

          {/* Descripción */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
              {active === 'quote' ? 'Descripción / Productos' : 'Notas (opcional)'}
            </label>
            <textarea ref={descRef} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={active === 'quote' ? 'Ej. 20 cubetas blanco mate, 5 base agua…' : `Ej. Cliente interesado, solicita muestra…`}
              rows={active === 'quote' ? 3 : 2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--card)', resize: 'vertical', minHeight: 60, fontFamily: 'var(--font-body)', lineHeight: 1.5, boxSizing: 'border-box' }} />
          </div>

          {/* Opción para cotización: actualizar estado */}
          {active === 'quote' && lead.estado !== 'Cotizado' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', marginBottom: 12, userSelect: 'none' }}>
              <input type="checkbox" checked={updateEstado} onChange={e => setUpdateEstado(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
              Actualizar estado del lead a <strong>Cotizado</strong>
            </label>
          )}

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setActive(null); resetForm() }}
              style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', background: 'none' }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 12.5 }}>
              {saving
                ? <><span style={{ width:13,height:13,border:'2px solid rgba(255,255,255,0.5)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',display:'inline-block' }} /> Guardando…</>
                : <><Ico.send /> Guardar actividad</>}
            </button>
          </div>
          {saveError && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 7, background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>
              ⚠️ {saveError}
            </div>
          )}
        </div>
      )}

      {!active && saveError && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>
          ⚠️ {saveError}
        </div>
      )}

      {/* ── Compartir la cotización por WhatsApp ── */}
      {quoteLink && (
        <div style={{ background: 'var(--success-soft)', border: '1px solid #BDE7C9', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
            <button onClick={() => sendQuoteFromCrm(quoteText)} disabled={sendingQuote}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1B9E4B', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Ico.send /> {sendingQuote ? 'Enviando…' : 'Enviar desde el CRM'}
            </button>
          )}
          {!quoteSent && (
            <a href={quoteLink} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: windowOpen ? 'transparent' : '#25D366', color: windowOpen ? '#1F5536' : '#fff', border: windowOpen ? '1px solid #86EFAC' : 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              <Ico.whatsapp /> Abrir WhatsApp
            </a>
          )}
          <button onClick={() => setQuoteLink(null)} aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Timeline de actividades ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 20, height: 20, border: '2.5px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : activities.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>📋</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Sin actividades registradas</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Usa los botones de arriba para registrar el primer seguimiento</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            Historial de seguimiento · {activities.length}
          </div>
          <div style={{ position: 'relative' }}>
            {/* Línea vertical del timeline */}
            <div style={{ position: 'absolute', left: 16, top: 8, bottom: 8, width: 2, background: 'var(--line)', borderRadius: 2 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {activities.map((a, idx) => {
                const t = getAType(a.type)
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 0, paddingBottom: idx < activities.length - 1 ? 14 : 0 }}>
                    {/* Dot */}
                    <div style={{ width: 34, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: t.bg, border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, zIndex: 1, position: 'relative' }}>
                        {t.emoji}
                      </div>
                    </div>

                    {/* Contenido */}
                    <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', minWidth: 0, marginLeft: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: t.color }}>{t.label}</span>
                        {a.amount && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', fontFamily: 'var(--font-display)' }}>
                            ${Number(a.amount).toLocaleString('es-MX')}
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {fmtDt(a.activity_date)}
                        </span>
                      </div>
                      {a.description && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{a.description}</div>
                      )}
                      {/* WhatsApp para cotizaciones pasadas */}
                      {a.type === 'quote' && lead.phone && (windowOpen ? (
                        <button onClick={() => sendQuoteFromCrm(buildQuoteText(lead.name, a.description || '', a.amount, storeName))} disabled={sendingQuote}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, fontWeight: 700, color: '#128C4A', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                          <Ico.whatsapp /> {sendingQuote ? 'Enviando…' : 'Reenviar desde el CRM'}
                        </button>
                      ) : (
                        <a href={buildWhatsApp(lead.phone, lead.name, a.description || '', a.amount, storeName)}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, fontWeight: 600, color: '#128C4A', textDecoration: 'none' }}>
                          <Ico.whatsapp /> Reenviar por WhatsApp
                        </a>
                      ))}
                      {/* Delete */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                        <button onClick={() => handleDelete(a.id)}
                          style={{ padding: '2px 6px', fontSize: 10.5, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4 }}
                          title="Eliminar">
                          × eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   PANEL DE RECORDATORIOS EN LEAD DETAIL
══════════════════════════════════════════════════════════ */
function RemindersTab({ lead }: { lead: any }) {
  const [reminders, setReminders]   = useState<Reminder[]>([])
  const [showForm, setShowForm]     = useState(false)
  const [remFecha, setRemFecha]     = useState('')
  const [remNota, setRemNota]       = useState('')
  const [remType, setRemType]       = useState('task')
  const [savingRem, setSavingRem]   = useState(false)
  const now = new Date()

  const loadReminders = useCallback(async () => {
    try {
      const r = await fetch(`/api/data/reminders?lead_id=${lead.id}`)
      const d = await r.json()
      setReminders(d.reminders || [])
    } catch {}
  }, [lead.id])

  useEffect(() => { loadReminders() }, [loadReminders])

  const saveReminder = async () => {
    if (!remFecha) return
    setSavingRem(true)
    try {
      await fetch('/api/data/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, lead_name: lead.name, nota: remNota.trim(), fecha_recordatorio: remFecha + ':00', type: remType, priority: 'medium' }),
      })
      setRemFecha(''); setRemNota(''); setShowForm(false)
      await loadReminders()
    } finally { setSavingRem(false) }
  }

  const completeReminder = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completado: true }) })
    await loadReminders()
  }

  const deleteReminder = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, { method: 'DELETE' })
    await loadReminders()
  }

  const pending   = reminders.filter(r => !r.completado).sort((a,b) => new Date(a.fecha_recordatorio).getTime() - new Date(b.fecha_recordatorio).getTime())
  const completed = reminders.filter(r =>  r.completado)

  const REM_TYPE_OPTS = [
    { key: 'task', emoji: '📋' }, { key: 'call', emoji: '📞' },
    { key: 'email', emoji: '📧' }, { key: 'whatsapp', emoji: '💬' }, { key: 'meeting', emoji: '🤝' },
  ]

  return (
    <div>
      {/* Cabecera con botón nuevo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ico.bell />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Recordatorios</span>
          {pending.length > 0 && (
            <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
              {pending.length}
            </span>
          )}
        </div>
        <button onClick={() => setShowForm(s => !s)}
          style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}>
          {showForm ? '× Cancelar' : '+ Nuevo'}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          {/* Tipo */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            {REM_TYPE_OPTS.map(t => (
              <button key={t.key} onClick={() => setRemType(t.key)}
                style={{ padding: '5px 10px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: '1px solid', borderColor: remType === t.key ? 'var(--brand)' : 'var(--line)', background: remType === t.key ? 'var(--brand-soft)' : 'transparent' }}>
                {t.emoji}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Fecha y hora *</label>
          <input type="datetime-local" value={remFecha} onChange={e => setRemFecha(e.target.value)} min={localNow()}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--card)', marginBottom: 8, boxSizing: 'border-box' }} />
          <input type="text" value={remNota} onChange={e => setRemNota(e.target.value)} placeholder="Nota (opcional)"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--card)', marginBottom: 10, boxSizing: 'border-box' }} />
          <button onClick={saveReminder} disabled={!remFecha || savingRem}
            className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}>
            {savingRem ? 'Guardando…' : '✓ Crear recordatorio'}
          </button>
        </div>
      )}

      {/* Lista pendientes */}
      {pending.length === 0 && !showForm && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>Sin recordatorios pendientes</div>
      )}
      {pending.map(r => {
        const overdue = new Date(r.fecha_recordatorio) < now
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 9, marginBottom: 6, background: overdue ? 'var(--brand-soft)' : 'var(--paper)', border: `1px solid ${overdue ? '#F5C8B3' : 'var(--line)'}` }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
              {REM_TYPE_OPTS.find(t => t.key === r.type)?.emoji ?? '📋'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? 'var(--brand-strong)' : 'var(--ink-2)' }}>{fmtRemDate(r.fecha_recordatorio)}</div>
              {r.nota && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{r.nota}</div>}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => completeReminder(r.id)}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', background: 'var(--success-soft)', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                ✓
              </button>
              <button onClick={() => deleteReminder(r.id)}
                style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer' }}>
                ×
              </button>
            </div>
          </div>
        )
      })}

      {/* Completados */}
      {completed.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontWeight: 500 }}>
            {completed.length} completado{completed.length !== 1 ? 's' : ''}
          </summary>
          {completed.map(r => (
            <div key={r.id} style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'line-through', marginTop: 4 }}>
              <span>✓</span>
              <span>{fmtRemDate(r.fecha_recordatorio)}</span>
              {r.nota && <span>· {r.nota}</span>}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   SLIDE-OVER DETALLE DEL LEAD (con tabs)
══════════════════════════════════════════════════════════ */
function LeadDetail({
  lead: l, configCanales, configSegmentos,
  onClose, onChangeEstado, onUpdated, onDeleted,
}: {
  lead: any; configCanales: string[]; configSegmentos: string[];
  onClose: () => void; onChangeEstado: (id: string, e: string) => void;
  onUpdated: (l: any) => void; onDeleted: (id: string) => void;
}) {
  type DTab = 'info' | 'actividades' | 'recordatorios'
  const [tab, setTab]           = useState<DTab>('info')
  const [editing, setEditing]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    canal: l.canal || '', segmento: l.segmento || '', estado: l.estado || 'Nuevo',
    monto: l.monto ? String(l.monto) : '', fecha: l.fecha || l.created_at?.slice(0,10) || '',
    notas: l.notas || '',
  })

  // Mantener el lead local sincronizado con props
  const [lead, setLead] = useState(l)
  useEffect(() => { setLead(l) }, [l])

  const selectStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }

  const ESTADO_COLORS: Record<string, string> = {
    'Nuevo': 'var(--c-cyan)', 'En seguimiento': 'var(--warning-fill)',
    'Cotizado': 'var(--c-magenta)', 'Ganado / Venta realizada': 'var(--success-fill)', 'Perdido': 'var(--muted-2)',
  }

  const [saveError, setSaveError] = useState('')
  const handleSaveLead = async () => {
    setSaving(true); setSaveError('')
    try {
      const r = await fetch(`/api/data/leads/${lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, monto: editForm.monto ? Number(editForm.monto) : null }),
      })
      const upd = await r.json().catch(() => ({}))
      if (!r.ok) { setSaveError(upd.error || 'No se pudieron guardar los cambios'); return }
      onUpdated({ ...lead, ...upd })
      setEditing(false)
    } finally { setSaving(false) }
  }

  const handleDeleteLead = async () => {
    setDeleting(true)
    await fetch(`/api/data/leads/${lead.id}`, { method: 'DELETE' })
    onDeleted(lead.id)
  }

  const handleEstadoFromActivity = (estado: string) => {
    setLead((prev: any) => ({ ...prev, estado }))
    onChangeEstado(lead.id, estado)
  }

  const TABS: { key: DTab; label: string; icon: any }[] = [
    { key: 'info',          label: 'Información', icon: Ico.info },
    { key: 'actividades',   label: 'Actividades', icon: Ico.history },
    { key: 'recordatorios', label: 'Recordatorios', icon: Ico.bell },
  ]

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail">

        {/* ── Cabecera ── */}
        <div className="detail-head">
          <button className="detail-close" onClick={onClose}><Ico.close /></button>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Lead</div>
          <div className="detail-title">{lead.name}</div>
          <div className="detail-meta">
            <EstadoChip value={lead.estado || '—'} />
            <SegmentoChip value={lead.segmento || '—'} />
            <CanalChip value={lead.canal || '—'} />
            {lead.monto && (
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>
                ${Number(lead.monto).toLocaleString('es-MX')}
              </span>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 20px' }}>
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setEditing(false); setConfirmDel(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '10px 12px', fontSize: 12.5, fontWeight: 600,
                  border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: '2px solid', marginBottom: -1,
                  borderColor: tab === t.key ? 'var(--brand)' : 'transparent',
                  color: tab === t.key ? 'var(--ink)' : 'var(--muted)',
                  transition: 'color 0.12s',
                }}>
                <Icon /> {t.label}
              </button>
            )
          })}
        </div>

        {/* ── Cuerpo ── */}
        <div className="detail-body">

          {/* ─── TAB: INFORMACIÓN ─── */}
          {tab === 'info' && (
            editing ? (
              <div className="detail-section">
                <h4>Editar lead</h4>
                <div className="field">
                  <label>Canal</label>
                  <select value={editForm.canal} onChange={e => setEditForm(f => ({ ...f, canal: e.target.value }))} style={selectStyle}>
                    {configCanales.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Segmento</label>
                  <select value={editForm.segmento} onChange={e => setEditForm(f => ({ ...f, segmento: e.target.value }))} style={selectStyle}>
                    {configSegmentos.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Estado</label>
                  <select value={editForm.estado} onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))} style={selectStyle}>
                    {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Valor estimado (MXN)</label>
                    <input type="number" value={editForm.monto} onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" inputMode="decimal" />
                  </div>
                  <div className="field">
                    <label>Fecha</label>
                    <input type="date" value={editForm.fecha} onChange={e => setEditForm(f => ({ ...f, fecha: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Notas</label>
                  <textarea value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
                </div>
                {saveError && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 8 }}>{saveError}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleSaveLead} disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="detail-section">
                  <h4>Información de contacto</h4>
                  <div className="kv-grid">
                    <div className="kv"><div className="k">Teléfono</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPhone(lead.phone) || '—'}</div></div>
                    <div className="kv"><div className="k">Correo</div><div className="v" style={{ fontSize: 13 }}>{lead.email || '—'}</div></div>
                    <div className="kv"><div className="k">Fecha de captura</div><div className="v">{fmtDateLong(lead.fecha || lead.created_at?.slice(0,10) || '')}</div></div>
                    <div className="kv"><div className="k">Canal</div><div className="v">{lead.canal || '—'}</div></div>
                  </div>
                </div>
                {lead.notas && (
                  <div className="detail-section">
                    <h4>Notas</h4>
                    <div className="notes-box">{lead.notas}</div>
                  </div>
                )}
                {/* Cambiar estado */}
                <div className="detail-section">
                  <h4>Estado del lead</h4>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ESTADOS.map(e => (
                      <button key={e} onClick={() => onChangeEstado(lead.id, e)} className={`filter-pill ${lead.estado === e ? 'active' : ''}`}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ESTADO_COLORS[e], flexShrink: 0 }}></span>
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Zona peligrosa */}
                {confirmDel && (
                  <div className="detail-section" style={{ background: 'var(--danger-soft)', border: '1px solid #F7C1C9', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>¿Eliminar este lead?</div>
                    <div style={{ fontSize: 12.5, color: '#7A0A18', marginBottom: 12 }}>Se eliminará junto con sus recordatorios y actividades.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} style={{ flex: 1 }}>Cancelar</button>
                      <button onClick={handleDeleteLead} disabled={deleting}
                        style={{ flex: 1, padding: '9px 0', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
                        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          )}

          {/* ─── TAB: ACTIVIDADES ─── */}
          {tab === 'actividades' && (
            <ActivitiesTab
              lead={lead}
              onEstadoUpdate={handleEstadoFromActivity}
            />
          )}

          {/* ─── TAB: RECORDATORIOS ─── */}
          {tab === 'recordatorios' && (
            <RemindersTab lead={lead} />
          )}

        </div>

        {/* ── Footer de acciones ── */}
        <div className="detail-foot">
          {tab === 'info' && !editing && <>
            {lead.phone && <a href={`tel:${lead.phone}`} className="btn btn-ghost btn-ghost-call"><Ico.phone /> Llamar</a>}
            {normalizePhone(lead.phone).length === 10 && (
              <Link href={`/whatsapp?phone=${normalizePhone(lead.phone)}`} className="btn btn-ghost btn-ghost-whatsapp">
                <Ico.whatsapp /> WhatsApp
              </Link>
            )}
            <button className="btn btn-ghost btn-ghost-call" onClick={() => { setEditing(true); setConfirmDel(false) }}>
              <Ico.edit /> Editar
            </button>
            <button className="btn btn-ghost btn-ghost-danger" onClick={() => { setConfirmDel(true); setEditing(false) }} style={{ color: 'var(--danger)' }}>
              <Ico.trash /> Eliminar
            </button>
          </>}
          {tab === 'actividades' && normalizePhone(lead.phone).length === 10 && (
            <Link href={`/whatsapp?phone=${normalizePhone(lead.phone)}`} className="btn btn-ghost btn-ghost-whatsapp">
              <Ico.whatsapp /> Abrir chat de WhatsApp
            </Link>
          )}
        </div>
      </aside>
    </>
  )
}

/* ══════════════════════════════════════════════════════════
   SELECTOR DE CONTACTO
══════════════════════════════════════════════════════════ */
function ContactPickerModal({ onClose, onSelect }: {
  onClose: () => void
  onSelect: (contact: any) => void
}) {
  const [contacts,  setContacts]  = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [query,     setQuery]     = useState('')

  useEffect(() => {
    fetch('/api/data/contacts')
      .then(r => r.json())
      .then(d => setContacts(d.contacts || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = query.trim()
    ? contacts.filter(c => `${c.name} ${c.phone || ''} ${c.company || ''}`.toLowerCase().includes(query.toLowerCase()))
    : contacts

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Seleccionar contacto</h3>
          <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>
        </div>

        {/* Buscador */}
        <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px' }}>
            <Ico.search />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono…"
              style={{ border: 'none', outline: 'none', background: 'none', flex: 1, fontSize: 13.5, color: 'var(--ink)' }}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="modal-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div style={{ width: 24, height: 24, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--muted)', fontSize: 13 }}>
              {query ? 'Sin resultados.' : 'No hay contactos registrados.'}
            </div>
          ) : (
            <div>
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--line)', cursor: 'pointer',
                    textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: c.segment === 'Constructor' ? '#9A6B00'
                              : c.segment === 'Arquitecto'  ? '#00839C'
                              : c.segment === 'Empresa'     ? '#861456'
                              : '#E50A26',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                  }}>
                    {c.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                      {c.phone ? c.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') : ''}
                      {c.company ? ` · ${c.company}` : ''}
                    </div>
                  </div>
                  {c.segment && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', flexShrink: 0 }}>{c.segment}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   CREAR LEAD DESDE CONTACTO
══════════════════════════════════════════════════════════ */
function LeadFromContactModal({ contact: c, canales, segmentos, onClose, onSaved }: {
  contact: any; canales: string[]; segmentos: string[]
  onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    canal:    c.acquisition_channel || canales[0]  || 'Referido',
    segmento: c.segment             || segmentos[0] || 'Hogar',
    monto: '', fecha: today, notas: '',
  })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const sel = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/data/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name, phone: c.phone, email: c.email || '',
          contact_id: c.id, canal: form.canal, segmento: form.segmento,
          estado: 'Nuevo',
          monto: form.monto ? Number(form.monto) : null,
          fecha: form.fecha, notas: form.notas || null,
        }),
      })
      if (r.ok) onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Nuevo lead</h3>
          <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>
        </div>
        <div className="modal-body">
          {/* Contacto de origen */}
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Contacto</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{c.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {c.phone && <span>{c.phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}</span>}
              {c.email && <span>{c.email}</span>}
              {c.company && <span>{c.company}</span>}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Canal</label>
              <select value={form.canal} onChange={e => upd('canal', e.target.value)} style={sel}>
                {canales.map(ch => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Segmento</label>
              <select value={form.segmento} onChange={e => upd('segmento', e.target.value)} style={sel}>
                {segmentos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Valor estimado (MXN)</label>
              <input type="number" min="0" value={form.monto} onChange={e => upd('monto', e.target.value)} placeholder="0.00" inputMode="decimal" />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => upd('fecha', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Notas iniciales</label>
            <textarea value={form.notas} onChange={e => upd('notas', e.target.value)}
              placeholder="Producto de interés, observaciones…" rows={3} style={{ resize: 'vertical', minHeight: 64 }} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Ico.plus /> {saving ? 'Guardando…' : 'Crear lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
