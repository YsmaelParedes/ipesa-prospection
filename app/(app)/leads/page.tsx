'use client'

import { useEffect, useState, useCallback } from 'react'
import { Avatar, CanalChip, EstadoChip, SegmentoChip, fmtDate, fmtDateLong, fmtPhone } from '@/components/IpesaUI'

const ESTADOS = ['Nuevo', 'En seguimiento', 'Cotizado', 'Cerrado', 'Perdido']
const CANALES_DEFAULT  = ['Referido', 'Visita a Tienda', 'WhatsApp', 'Redes Sociales', 'Campaña Pagada', 'Otro']
const SEGMENTOS_DEFAULT = ['Constructor', 'Arquitecto', 'Hogar', 'Empresa']

const Ico = {
  close:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  plus:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  phone:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  table:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>,
  kanban:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/></svg>,
  chevron:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><path d="m9 18 6-6-6-6"/></svg>,
  check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  clock:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  edit:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  search:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)' }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
}

export default function LeadsPage() {
  const [leads, setLeads]           = useState<any[]>([])
  const [canales, setCanales]       = useState<string[]>(CANALES_DEFAULT)
  const [segmentos, setSegmentos]   = useState<string[]>(SEGMENTOS_DEFAULT)
  const [configCanales, setConfigCanales]   = useState<string[]>(CANALES_DEFAULT)
  const [configSegmentos, setConfigSegmentos] = useState<string[]>(SEGMENTOS_DEFAULT)
  const [view, setView]             = useState<'tabla'|'kanban'>('tabla')
  const [canalF, setCanalF]         = useState('Todos')
  const [segF, setSegF]             = useState('Todos')
  const [estadoF, setEstadoF]       = useState('Todos')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<any | null>(null)
  const [toast, setToast]           = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  /* Config dinámica */
  useEffect(() => {
    fetch('/api/data/config?type=canal').then(r => r.json()).then(d => {
      if (d.items?.length) setConfigCanales(d.items.map((i: any) => i.label))
    }).catch(() => {})
    fetch('/api/data/config?type=segment').then(r => r.json()).then(d => {
      if (d.items?.length) setConfigSegmentos(d.items.map((i: any) => i.label))
    }).catch(() => {})
  }, [])

  /* Búsqueda global desde topbar */
  useEffect(() => {
    const h = (e: Event) => setSearch((e as CustomEvent).detail ?? '')
    window.addEventListener('ipesa:search', h)
    return () => window.removeEventListener('ipesa:search', h)
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

  const filtered = leads.filter(l => {
    if (canalF !== 'Todos' && l.canal !== canalF) return false
    if (segF   !== 'Todos' && l.segmento !== segF) return false
    if (estadoF !== 'Todos' && l.estado !== estadoF) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${l.name} ${l.phone || ''} ${l.email || ''} ${l.canal || ''} ${l.segmento || ''} ${l.estado || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const updateEstado = async (id: string, estado: string) => {
    await fetch(`/api/data/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) })
    setLeads(prev => prev.map(l => l.id === id ? { ...l, estado } : l))
    if (selected?.id === id) setSelected((s: any) => ({ ...s, estado }))
    showToast(`Estado actualizado a "${estado}"`)
  }

  const handleLeadUpdated = (updated: any) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelected(updated)
    showToast('Lead actualizado ✓')
  }

  const handleLeadDeleted = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelected(null)
    showToast('Lead eliminado')
  }

  return (
    <>
      <div className="section-head">
        <h2>Pipeline de leads</h2>
        <span className="count">{filtered.length} de {leads.length}</span>
        <div style={{ marginLeft: 'auto' }}>
          <div className="view-toggle">
            <button className={view === 'tabla' ? 'active' : ''} onClick={() => setView('tabla')}><Ico.table /> Tabla</button>
            <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}><Ico.kanban /> Kanban</button>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <FilterSelect label="Canal"    value={canalF}  options={canales}   onChange={setCanalF} />
        <FilterSelect label="Segmento" value={segF}    options={segmentos} onChange={setSegF} />
        <FilterSelect label="Estado"   value={estadoF} options={ESTADOS}   onChange={setEstadoF} />
        {(canalF !== 'Todos' || segF !== 'Todos' || estadoF !== 'Todos') && (
          <button className="filter-pill" onClick={() => { setCanalF('Todos'); setSegF('Todos'); setEstadoF('Todos') }}>Limpiar filtros</button>
        )}
        {/* Búsqueda de texto */}
        <div style={{ marginLeft: 'auto' }} className="search-input">
          <Ico.search />
          <input
            placeholder="Buscar lead…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 13 }}>
          {canalF !== 'Todos' || segF !== 'Todos' || estadoF !== 'Todos' || search
            ? 'Sin resultados para estos filtros.'
            : <>Sin leads aún · <a href="/contactos" style={{ color: 'var(--ipesa-orange)', fontWeight: 600 }}>Crear desde un contacto →</a></>}
        </div>
      ) : view === 'tabla' ? (
        <LeadsTable leads={filtered} onSelect={setSelected} />
      ) : (
        <LeadsKanban leads={filtered} onSelect={setSelected} onChangeEstado={updateEstado} />
      )}

      {selected && (
        <LeadDetail
          lead={selected}
          configCanales={configCanales}
          configSegmentos={configSegmentos}
          onClose={() => setSelected(null)}
          onChangeEstado={updateEstado}
          onRefresh={load}
          onUpdated={handleLeadUpdated}
          onDeleted={handleLeadDeleted}
        />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const arrow = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%2380766B' stroke-width='1.6'><path d='m3 5 3 3 3-3'/></svg>")`
  return (
    <select className="filter-pill" value={value} onChange={e => onChange(e.target.value)}
      style={{ appearance: 'none', paddingRight: 26, backgroundImage: arrow, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 12 }}>
      <option value="Todos">{label}: Todos</option>
      {options.map(o => <option key={o} value={o}>{label}: {o}</option>)}
    </select>
  )
}

function LeadsTable({ leads, onSelect }: { leads: any[]; onSelect: (l: any) => void }) {
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

function LeadsKanban({ leads, onSelect, onChangeEstado }: { leads: any[]; onSelect: (l: any) => void; onChangeEstado: (id: string, e: string) => void }) {
  return (
    <div className="kanban">
      {ESTADOS.map(estado => {
        const col   = leads.filter(l => l.estado === estado)
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
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <CanalChip value={l.canal || '—'} small />
                </div>
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

/* ── Slide-over detalle del lead ── */
function LeadDetail({
  lead: l, configCanales, configSegmentos,
  onClose, onChangeEstado, onRefresh, onUpdated, onDeleted,
}: {
  lead: any; configCanales: string[]; configSegmentos: string[];
  onClose: () => void; onChangeEstado: (id: string, e: string) => void;
  onRefresh: () => void; onUpdated: (l: any) => void; onDeleted: (id: string) => void;
}) {
  const ESTADO_COLORS: Record<string, string> = {
    'Nuevo': '#1F3A5F', 'En seguimiento': '#F2B544',
    'Cotizado': '#EE5A24', 'Cerrado': '#3D8B5C', 'Perdido': '#80766B',
  }
  const selectStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }

  /* ── Recordatorios ── */
  const [reminders, setReminders]     = useState<any[]>([])
  const [showRemForm, setShowRemForm] = useState(false)
  const [remFecha, setRemFecha]       = useState('')
  const [remNota, setRemNota]         = useState('')
  const [savingRem, setSavingRem]     = useState(false)

  /* ── Edición ── */
  const [editing, setEditing]       = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [editForm, setEditForm]     = useState({
    canal: l.canal || '', segmento: l.segmento || '', estado: l.estado || 'Nuevo',
    monto: l.monto ? String(l.monto) : '', fecha: l.fecha || l.created_at?.slice(0,10) || '',
    notas: l.notas || '',
  })

  const updEdit = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }))

  const loadReminders = useCallback(async () => {
    try {
      const r = await fetch(`/api/data/reminders?lead_id=${l.id}`)
      const d = await r.json()
      setReminders(d.reminders || [])
    } catch {}
  }, [l.id])

  useEffect(() => { loadReminders() }, [loadReminders])

  const saveReminder = async () => {
    if (!remFecha) return
    setSavingRem(true)
    try {
      await fetch('/api/data/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: l.id, lead_name: l.name, nota: remNota.trim(), fecha_recordatorio: remFecha + ':00' }),
      })
      setRemFecha(''); setRemNota(''); setShowRemForm(false)
      await loadReminders()
    } finally { setSavingRem(false) }
  }

  const completeReminder = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completado: true }) })
    await loadReminders()
  }

  const handleSaveLead = async () => {
    setSaving(true)
    const r = await fetch(`/api/data/leads/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, monto: editForm.monto ? Number(editForm.monto) : null }),
    })
    if (r.ok) {
      const updated = await r.json()
      onUpdated({ ...l, ...updated })
      setEditing(false)
    }
    setSaving(false)
  }

  const handleDeleteLead = async () => {
    setDeleting(true)
    await fetch(`/api/data/leads/${l.id}`, { method: 'DELETE' })
    onDeleted(l.id)
  }

  const pending   = reminders.filter(r => !r.completado)
  const completed = reminders.filter(r =>  r.completado)
  const now       = new Date()

  const fmtDt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]} · ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail">
        <div className="detail-head">
          <button className="detail-close" onClick={onClose}><Ico.close /></button>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Lead</div>
          <div className="detail-title">{l.name}</div>
          <div className="detail-meta">
            <EstadoChip value={l.estado || '—'} />
            <SegmentoChip value={l.segmento || '—'} />
            <CanalChip value={l.canal || '—'} />
            {l.monto && (
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ipesa-orange)' }}>
                ${Number(l.monto).toLocaleString('es-MX')}
              </span>
            )}
          </div>
        </div>

        <div className="detail-body">
          {editing ? (
            /* ── Modo edición lead ── */
            <div className="detail-section">
              <h4>Editar lead</h4>
              <div className="field">
                <label>Canal</label>
                <select value={editForm.canal} onChange={e => updEdit('canal', e.target.value)} style={selectStyle}>
                  {configCanales.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Segmento</label>
                <select value={editForm.segmento} onChange={e => updEdit('segmento', e.target.value)} style={selectStyle}>
                  {configSegmentos.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Estado</label>
                <select value={editForm.estado} onChange={e => updEdit('estado', e.target.value)} style={selectStyle}>
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Valor estimado (MXN)</label>
                  <input type="number" value={editForm.monto} onChange={e => updEdit('monto', e.target.value)} placeholder="0.00" inputMode="decimal" />
                </div>
                <div className="field">
                  <label>Fecha</label>
                  <input type="date" value={editForm.fecha} onChange={e => updEdit('fecha', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Notas</label>
                <textarea value={editForm.notas} onChange={e => updEdit('notas', e.target.value)} rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSaveLead} disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          ) : (
            /* ── Modo vista ── */
            <>
              <div className="detail-section">
                <h4>Información de contacto</h4>
                <div className="kv-grid">
                  <div className="kv"><div className="k">Teléfono</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPhone(l.phone) || '—'}</div></div>
                  <div className="kv"><div className="k">Correo</div><div className="v" style={{ fontSize: 13 }}>{l.email || '—'}</div></div>
                  <div className="kv"><div className="k">Fecha de captura</div><div className="v">{fmtDateLong(l.fecha || l.created_at?.slice(0,10) || '')}</div></div>
                  <div className="kv"><div className="k">Canal</div><div className="v">{l.canal || '—'}</div></div>
                </div>
              </div>

              {l.notas && (
                <div className="detail-section">
                  <h4>Notas</h4>
                  <div className="notes-box">{l.notas}</div>
                </div>
              )}

              {/* Cambiar estado */}
              <div className="detail-section">
                <h4>Cambiar estado</h4>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ESTADOS.map(e => (
                    <button key={e} onClick={() => onChangeEstado(l.id, e)} className={`filter-pill ${l.estado === e ? 'active' : ''}`}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ESTADO_COLORS[e], flexShrink: 0 }}></span>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Recordatorios ── */}
              <div className="detail-section">
                <h4 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ico.clock />
                    Recordatorios
                    {pending.length > 0 && (
                      <span style={{ background: 'var(--ipesa-orange)', color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.6 }}>
                        {pending.length}
                      </span>
                    )}
                  </span>
                  <button onClick={() => setShowRemForm(s => !s)}
                    style={{ fontSize: 11, fontWeight: 600, color: 'var(--ipesa-orange)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}>
                    {showRemForm ? 'Cancelar' : '+ Nuevo'}
                  </button>
                </h4>

                {showRemForm && (
                  <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Fecha y hora *</label>
                      <input type="datetime-local" value={remFecha} onChange={e => setRemFecha(e.target.value)}
                        min={(() => { const d = new Date(); const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0,16) })()}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--card)' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Nota</label>
                      <input type="text" value={remNota} onChange={e => setRemNota(e.target.value)}
                        placeholder="Ej. Llamar para confirmar presupuesto"
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--card)' }} />
                    </div>
                    <button onClick={saveReminder} disabled={!remFecha || savingRem}
                      className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      {savingRem ? 'Guardando…' : '✓ Guardar recordatorio'}
                    </button>
                  </div>
                )}

                {pending.length === 0 && !showRemForm && (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
                    Sin recordatorios pendientes
                  </div>
                )}
                {pending.map(r => {
                  const overdue = new Date(r.fecha_recordatorio) < now
                  return (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 12px', borderRadius: 9, marginBottom: 6,
                      background: overdue ? 'var(--ipesa-orange-soft)' : 'var(--paper)',
                      border: `1px solid ${overdue ? '#F5C8B3' : 'var(--line)'}`,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: overdue ? 'var(--ipesa-orange)' : 'var(--ipesa-yellow)', flexShrink: 0, marginTop: 4 }}></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#8A2F0A' : 'var(--ink-2)' }}>{fmtDt(r.fecha_recordatorio)}</div>
                        {r.nota && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{r.nota}</div>}
                      </div>
                      <button onClick={() => completeReminder(r.id)}
                        style={{ fontSize: 11, fontWeight: 600, color: 'var(--ipesa-green)', background: 'var(--ipesa-green-soft)', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>
                        ✓ Listo
                      </button>
                    </div>
                  )
                })}

                {completed.length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontWeight: 500 }}>
                      {completed.length} completado{completed.length !== 1 ? 's' : ''}
                    </summary>
                    {completed.map(r => (
                      <div key={r.id} style={{ padding: '7px 12px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'line-through', marginTop: 4 }}>
                        <span>✓</span><span>{fmtDt(r.fecha_recordatorio)}</span>
                        {r.nota && <span>· {r.nota}</span>}
                      </div>
                    ))}
                  </details>
                )}
              </div>

              {/* Zona peligrosa */}
              {confirmDel && (
                <div className="detail-section" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>¿Eliminar este lead?</div>
                  <div style={{ fontSize: 12.5, color: '#7F1D1D', marginBottom: 12 }}>Se eliminará junto con sus recordatorios asociados.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} style={{ flex: 1 }}>Cancelar</button>
                    <button onClick={handleDeleteLead} disabled={deleting}
                      style={{ flex: 1, padding: '9px 0', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
                      {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="detail-foot">
          {!editing && <>
            {l.phone && <a href={`tel:${l.phone}`} className="btn btn-ghost"><Ico.phone /> Llamar</a>}
            {l.phone && (
              <a href={`https://wa.me/52${(l.phone || '').replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                <Ico.whatsapp /> WhatsApp
              </a>
            )}
            <button className="btn btn-ghost" onClick={() => { setEditing(true); setConfirmDel(false) }}>
              <Ico.edit /> Editar
            </button>
            <button className="btn btn-ghost" onClick={() => { setConfirmDel(true); setEditing(false) }} style={{ color: 'var(--ipesa-rose)' }}>
              <Ico.trash /> Eliminar
            </button>
          </>}
        </div>
      </aside>
    </>
  )
}
