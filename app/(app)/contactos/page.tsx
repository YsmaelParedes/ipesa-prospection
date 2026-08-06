'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Avatar, TipoChip, CanalChip, FilterDropdown, fmtDateLong, fmtPhone, normalizePhone, isMobilePhone } from '@/components/IpesaUI'

/* ── Iconos ── */
const Ico = {
  close:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  phone:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  mail:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  upload:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  download:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  chevron: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><path d="m9 18 6-6-6-6"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>,
  edit:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  xmark:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
}

const TIPO_COLORS: Record<string, string> = {
  'Constructor': '#F2B544', 'Arquitecto': '#3D8B5C', 'Hogar': '#EE5A24', 'Empresa': '#1F3A5F',
}
const TIPO_ICONS: Record<string, string> = {
  'Constructor': '🔨', 'Arquitecto': '📐', 'Hogar': '🏠', 'Empresa': '🏢',
}
const TIPOS_DEFAULT  = ['Constructor', 'Arquitecto', 'Hogar', 'Empresa']
const CANALES_DEFAULT = ['Referido', 'Visita a Tienda', 'WhatsApp', 'Redes Sociales', 'Campaña Pagada', 'Otro']

const CAMPOS_DESTINO = ['name','phone','email','company','address','postal_code','segment','acquisition_channel']
const CAMPO_LABELS: Record<string,string> = {
  name:'Nombre', phone:'Teléfono', email:'Correo', company:'Empresa',
  address:'Dirección', postal_code:'C.P.', segment:'Tipo', acquisition_channel:'Canal',
}

function handlePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length > 10) digits = digits.slice(2)
  return digits.slice(0, 10)
}

/* ── Select helper ── */
function SelectField({ label, value, options, onChange, required, placeholder }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  required?: boolean; placeholder?: string;
}) {
  const isEmpty = required && !value
  return (
    <div className="field">
      <label>{label}{required && ' *'}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 9,
          border: `1px solid ${isEmpty ? 'var(--ipesa-rose)' : 'var(--line)'}`,
          background: 'var(--card)', fontSize: 13.5, outline: 'none',
          color: value ? 'var(--ink)' : 'var(--muted)',
        }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {isEmpty && (
        <div style={{ color: 'var(--ipesa-rose)', fontSize: 11.5, marginTop: 4 }}>
          Este campo es obligatorio
        </div>
      )}
    </div>
  )
}

export default function ContactosPage() {
  const [contacts, setContacts]       = useState<any[]>([])
  const [tipos, setTipos]             = useState<string[]>(TIPOS_DEFAULT)
  const [canales, setCanales]         = useState<string[]>(CANALES_DEFAULT)
  const [tipoFiltro, setTipoFiltro]   = useState('Todos')
  const [search, setSearch]           = useState('')
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<any | null>(null)
  const [showNew, setShowNew]         = useState(false)
  const [showImport, setShowImport]               = useState(false)
  const [showExport, setShowExport]               = useState(false)
  const [showOnlyLandlines, setShowOnlyLandlines] = useState(false)
  const [toast, setToast]                         = useState('')

  /* Selección múltiple */
  const [checkedIds, setCheckedIds]       = useState<Set<string>>(new Set())
  const [confirmBulkDel, setConfirmBulkDel] = useState(false)
  const [bulkDeleting, setBulkDeleting]   = useState(false)
  const lastCheckedIdx                    = useRef<number | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  /* Carga config dinámica (segmentos + canales) */
  useEffect(() => {
    fetch('/api/data/config?type=segment').then(r => r.json()).then(d => {
      if (d.items?.length) setTipos(d.items.map((i: any) => i.label))
    }).catch(() => {})
    fetch('/api/data/config?type=canal').then(r => r.json()).then(d => {
      if (d.items?.length) setCanales(d.items.map((i: any) => i.label))
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/data/contacts')
      const d = await r.json()
      setContacts(d.contacts || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  /* Escuchar búsqueda global del topbar */
  useEffect(() => {
    const h = (e: Event) => setSearch((e as CustomEvent).detail ?? '')
    window.addEventListener('ipesa:search', h)
    return () => window.removeEventListener('ipesa:search', h)
  }, [])

  useEffect(() => {
    const h = () => setShowNew(true)
    window.addEventListener('ipesa:new-contact', h)
    return () => window.removeEventListener('ipesa:new-contact', h)
  }, [])

  const landlineCount = contacts.filter(c => !isMobilePhone(c.phone)).length

  const filtered = contacts.filter(c => {
    if (showOnlyLandlines && isMobilePhone(c.phone)) return false
    if (!showOnlyLandlines && tipoFiltro !== 'Todos' && c.segment !== tipoFiltro) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${c.name} ${c.email} ${c.phone} ${c.company || ''} ${c.acquisition_channel || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const countFor = (t: string) => t === 'Todos' ? contacts.length : contacts.filter(c => c.segment === t).length

  /* Update selected contact in-place after edit */
  const handleContactUpdated = (updated: any) => {
    setSelected(updated)
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
    showToast('Contacto actualizado ✓')
  }

  const handleContactDeleted = (id: string) => {
    setSelected(null)
    setContacts(prev => prev.filter(c => c.id !== id))
    showToast('Contacto eliminado')
  }

  /* ── Selección múltiple ── */
  const someChecked        = checkedIds.size > 0
  const allFilteredChecked = filtered.length > 0 && filtered.every(c => checkedIds.has(c.id))

  const clearSelection = () => {
    setCheckedIds(new Set())
    lastCheckedIdx.current = null
    setConfirmBulkDel(false)
  }

  const toggleAll = () => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (allFilteredChecked) filtered.forEach(c => next.delete(c.id))
      else                     filtered.forEach(c => next.add(c.id))
      return next
    })
    lastCheckedIdx.current = null
  }

  const toggleCheck = (id: string, idx: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastCheckedIdx.current !== null) {
      const from = Math.min(lastCheckedIdx.current, idx)
      const to   = Math.max(lastCheckedIdx.current, idx)
      setCheckedIds(prev => {
        const next = new Set(prev)
        filtered.slice(from, to + 1).forEach(c => next.add(c.id))
        return next
      })
    } else {
      setCheckedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else              next.add(id)
        return next
      })
      lastCheckedIdx.current = idx
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = [...checkedIds]
    await Promise.all(ids.map(id => fetch(`/api/data/contacts/${id}`, { method: 'DELETE' })))
    setContacts(prev => prev.filter(c => !checkedIds.has(c.id)))
    if (selected && checkedIds.has(selected.id)) setSelected(null)
    const n = ids.length
    clearSelection()
    setBulkDeleting(false)
    showToast(`${n} contacto${n !== 1 ? 's' : ''} eliminado${n !== 1 ? 's' : ''} ✓`)
  }

  return (
    <>
      <div className="section-head">
        {someChecked ? (
          /* ── Barra de selección ── */
          <>
            <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={clearSelection}>
              <Ico.xmark /> Cancelar
            </button>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>
              {checkedIds.size} seleccionado{checkedIds.size !== 1 ? 's' : ''}
            </span>
            {!confirmBulkDel ? (
              <button
                className="btn"
                style={{ marginLeft: 'auto', background: '#DC2626', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={() => setConfirmBulkDel(true)}
              >
                <Ico.trash /> Eliminar {checkedIds.size}
              </button>
            ) : (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>
                  ¿Eliminar {checkedIds.size} contacto{checkedIds.size !== 1 ? 's' : ''}? No se puede deshacer.
                </span>
                <button className="btn btn-ghost" onClick={() => setConfirmBulkDel(false)} disabled={bulkDeleting}>No</button>
                <button
                  className="btn"
                  style={{ background: '#DC2626', color: '#fff', border: 'none', minWidth: 100 }}
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Cabecera normal ── */
          <>
            <h2>Base de contactos</h2>
            <span className="count">{filtered.length} de {contacts.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowExport(true)}>
                <Ico.download /> Exportar
              </button>
              <button className="btn btn-ghost" onClick={() => setShowImport(true)}>
                <Ico.upload /> Importar
              </button>
            </div>
          </>
        )}
      </div>

      {/* Barra de búsqueda móvil — siempre visible en mobile (el search del topbar está oculto) */}
      <div className="search-bar-mobile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input
          placeholder="Buscar contacto…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setSearch('') }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
        )}
      </div>

      <div className="filter-bar">
        {!showOnlyLandlines && (
          <FilterDropdown
            value={tipoFiltro}
            options={tipos}
            countFor={countFor}
            onChange={setTipoFiltro}
            triggerLabel={v => v === 'Todos' ? 'Todos los tipos' : v}
            optionLabel={v => v === 'Todos' ? 'Todos los tipos' : v}
            searchPlaceholder="Buscar tipo…"
          />
        )}
        {landlineCount > 0 && (
          <button
            className={`filter-pill ${showOnlyLandlines ? 'active' : ''}`}
            onClick={() => setShowOnlyLandlines(v => !v)}
            style={showOnlyLandlines ? { borderColor: '#DC2626', background: '#FEF2F2', color: '#DC2626' } : { borderColor: 'var(--ipesa-rose)', color: 'var(--ipesa-rose)' }}
          >
            📞 Fijos detectados
            <span className="count" style={showOnlyLandlines ? { background: '#FEF2F2', color: '#DC2626' } : undefined}>{landlineCount}</span>
          </button>
        )}
        <div style={{ marginLeft: 'auto' }} className="search-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)' }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input placeholder="Buscar por nombre, teléfono, canal…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 13 }}>
          {search || tipoFiltro !== 'Todos' ? 'Sin resultados para este filtro.' : 'No hay contactos aún. Importa o crea el primero.'}
        </div>
      ) : (
        <div className="table-wrap contacts-table">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={allFilteredChecked}
                    onChange={toggleAll}
                    title="Seleccionar todos"
                    style={{ width: 15, height: 15, accentColor: 'var(--ipesa-orange)', cursor: 'pointer', display: 'block', margin: '0 auto' }}
                  />
                </th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Canal</th>
                <th>Tipo</th>
                <th>Fecha de registro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                const isChecked = checkedIds.has(c.id)
                return (
                  <tr
                    key={c.id}
                    onClick={() => { if (someChecked) toggleCheck(c.id, idx, { shiftKey: false } as any); else setSelected(c) }}
                    style={{ background: isChecked ? 'rgba(238,90,36,0.06)' : undefined, userSelect: 'none' }}
                  >
                    <td
                      style={{ width: 44, paddingRight: 0 }}
                      onClick={e => { e.stopPropagation(); toggleCheck(c.id, idx, e) }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ width: 15, height: 15, accentColor: 'var(--ipesa-orange)', cursor: 'pointer', display: 'block', margin: '0 auto', pointerEvents: 'none' }}
                      />
                    </td>
                    <td>
                      <div className="cell-name">
                        <Avatar name={c.name} color={TIPO_COLORS[c.segment]} size={32} />
                        <div>
                          <div className="nm">{c.name}</div>
                          <div className="em">{c.company || c.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Teléfono" className="cell-mono">
                      {fmtPhone(c.phone)}
                      {!isMobilePhone(c.phone) && (
                        <span style={{ marginLeft: 6, fontSize: 10, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--font-sans)', fontWeight: 600, verticalAlign: 'middle' }}>Fijo</span>
                      )}
                    </td>
                    <td data-label="Canal">
                      {c.acquisition_channel ? <CanalChip value={c.acquisition_channel} small /> : <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>—</span>}
                    </td>
                    <td data-label="Tipo"><TipoChip value={c.segment || '—'} /></td>
                    <td data-label="Registro" className="cell-muted">{fmtDateLong(c.created_at?.slice(0, 10) || '')}</td>
                    <td className="cell-chevron" style={{ width: 40, textAlign: 'right' }}>
                      {isChecked ? <Ico.check /> : <Ico.chevron />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ContactDetail
          contact={selected}
          tipos={tipos}
          canales={canales}
          onClose={() => setSelected(null)}
            onUpdated={handleContactUpdated}
          onDeleted={handleContactDeleted}
        />
      )}


      {showNew && (
        <ContactModal
          tipos={tipos}
          canales={canales}
          onClose={() => setShowNew(false)}
          onSave={async (form) => {
            const r = await fetch('/api/data/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...form, phone: normalizePhone(form.phone) }),
            })
            if (r.ok) { showToast('Contacto creado ✓'); load() }
            else showToast('Error al crear contacto')
            setShowNew(false)
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load(); showToast('Importación completada ✓') }}
        />
      )}

      {showExport && (
        <ExportModal
          contacts={contacts}
          tipos={tipos}
          onClose={() => setShowExport(false)}
        />
      )}

      {toast && (
        <div className="toast-fixed">
          <Ico.check />
          {toast}
        </div>
      )}
    </>
  )
}

/* ── Slide-over detalle de contacto ── */
function ContactDetail({
  contact: c, tipos, canales, onClose, onUpdated, onDeleted,
}: {
  contact: any; tipos: string[]; canales: string[];
  onClose: () => void;
  onUpdated: (c: any) => void; onDeleted: (id: string) => void;
}) {
  const [leads, setLeads]         = useState<any[]>([])
  const [editing, setEditing]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [editForm, setEditForm]   = useState({
    name: c.name || '', phone: c.phone || '', email: c.email || '',
    company: c.company || '', segment: c.segment || tipos[0] || '',
    acquisition_channel: c.acquisition_channel || canales[0] || '',
    address: c.address || '',
  })
  const [phoneErr, setPhoneErr]   = useState('')

  useEffect(() => {
    fetch('/api/data/leads')
      .then(r => r.json())
      .then(d => setLeads((d.leads || []).filter((l: any) =>
        l.contact_id === c.id ||
        (c.email && l.email && l.email === c.email) ||
        (c.phone && l.phone && l.phone === c.phone)
      )))
      .catch(() => {})
  }, [c])

  const upd = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }))
  const onPhoneChange = (raw: string) => {
    const digits = handlePhoneInput(raw)
    upd('phone', digits)
    setPhoneErr(digits.length > 0 && digits.length < 10 ? 'Debe tener 10 dígitos' : '')
  }
  const canSaveEdit = editForm.name.trim() && editForm.phone.length === 10 && !phoneErr
    && !!editForm.segment && !!editForm.acquisition_channel

  const handleSave = async () => {
    setSaving(true)
    const r = await fetch(`/api/data/contacts/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, phone: normalizePhone(editForm.phone) }),
    })
    if (r.ok) {
      const updated = await r.json()
      onUpdated(Array.isArray(updated) ? updated[0] : updated)
      setEditing(false)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await fetch(`/api/data/contacts/${c.id}`, { method: 'DELETE' })
    onDeleted(c.id)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail">
        <div className="detail-head">
          <button className="detail-close" onClick={onClose}><Ico.close /></button>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Contacto</div>
          <div className="detail-title">{c.name}</div>
          <div className="detail-meta">
            <TipoChip value={c.segment || '—'} />
            {c.acquisition_channel && <CanalChip value={c.acquisition_channel} small />}
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Desde {fmtDateLong(c.created_at?.slice(0,10) || '')}</span>
          </div>
        </div>

        <div className="detail-body">
          {editing ? (
            /* ── Modo edición ── */
            <div className="detail-section">
              <h4>Editar contacto</h4>
              <div className="field">
                <label>Nombre completo *</label>
                <input value={editForm.name} onChange={e => upd('name', e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Teléfono * <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(10 dígitos)</span></label>
                  <input value={editForm.phone} onChange={e => onPhoneChange(e.target.value)} maxLength={10} inputMode="numeric"
                    style={phoneErr ? { borderColor: 'var(--ipesa-rose)' } : undefined} />
                  {phoneErr && <div style={{ color: 'var(--ipesa-rose)', fontSize: 11.5, marginTop: 4 }}>{phoneErr}</div>}
                </div>
                <div className="field">
                  <label>Correo</label>
                  <input value={editForm.email} onChange={e => upd('email', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Empresa</label>
                <input value={editForm.company} onChange={e => upd('company', e.target.value)} />
              </div>
              <SelectField label="Canal de adquisición" value={editForm.acquisition_channel} options={canales} onChange={v => upd('acquisition_channel', v)} required placeholder="— Seleccionar canal —" />
              <SelectField label="Tipo de cliente" value={editForm.segment} options={tipos} onChange={v => upd('segment', v)} required placeholder="— Seleccionar tipo —" />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancelar</button>
                <button className="btn btn-primary" disabled={!canSaveEdit || saving} onClick={handleSave} style={{ flex: 1 }}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          ) : (
            /* ── Modo vista ── */
            <>
              <div className="detail-section">
                <h4>Datos de contacto</h4>
                <div className="kv-grid">
                  <div className="kv"><div className="k">Teléfono</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPhone(c.phone) || '—'}</div></div>
                  <div className="kv"><div className="k">Correo</div><div className="v" style={{ fontSize: 13 }}>{c.email || '—'}</div></div>
                  <div className="kv"><div className="k">Empresa</div><div className="v">{c.company || '—'}</div></div>
                  <div className="kv"><div className="k">Canal</div><div className="v">{c.acquisition_channel || '—'}</div></div>
                  <div className="kv"><div className="k">Dirección</div><div className="v" style={{ fontSize: 12 }}>{c.address || '—'}</div></div>
                  <div className="kv"><div className="k">Registro</div><div className="v">{fmtDateLong(c.created_at?.slice(0,10) || '')}</div></div>
                </div>
              </div>

              <div className="detail-section">
                <h4>Leads asociados ({leads.length})</h4>
                {leads.length === 0 ? (
                  <div className="notes-box" style={{ background: 'var(--paper)', color: 'var(--muted)', borderColor: 'var(--line)' }}>
                    Sin leads activos registrados para este contacto.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {leads.map((l: any) => (
                      <div key={l.id} className="lead-card">
                        <div className="lc-name">{l.name}</div>
                        <div className="lc-meta">{l.monto ? `$${Number(l.monto).toLocaleString('es-MX')}` : 'Sin monto'} · {l.fecha?.slice(0,10) || ''}</div>
                        <div className="lc-foot">
                          <span className={`chip chip-${(l.estado||'nuevo').toLowerCase().replace(/\s+/g,'-').normalize('NFD').replace(/[̀-ͯ]/g,'')}`} style={{ fontSize: 11, padding: '3px 8px' }}>
                            <span className="chip-dot"></span>{l.estado}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Zona peligrosa */}
              {confirmDel && (
                <div className="detail-section" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>¿Eliminar este contacto?</div>
                  <div style={{ fontSize: 12.5, color: '#7F1D1D', marginBottom: 12 }}>Esta acción no se puede deshacer. Se eliminará permanentemente.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} style={{ flex: 1 }}>Cancelar</button>
                    <button onClick={handleDelete} disabled={deleting}
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
            {c.phone && <a href={`tel:${normalizePhone(c.phone)}`} className="btn btn-ghost btn-ghost-call"><Ico.phone /> Llamar</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn btn-ghost btn-ghost-mail"><Ico.mail /> Correo</a>}
            <button className="btn btn-ghost btn-ghost-call" onClick={() => { setEditing(true); setConfirmDel(false) }} style={{ color: 'var(--ink-2)' }}>
              <Ico.edit /> Editar
            </button>
            <button className="btn btn-ghost btn-ghost-danger" onClick={() => { setConfirmDel(true); setEditing(false) }} style={{ color: 'var(--ipesa-rose)' }}>
              <Ico.trash /> Eliminar
            </button>
          </>}
        </div>
      </aside>
    </>
  )
}

/* ── Modal unificado: crear/editar contacto ── */
function ContactModal({
  contact, tipos, canales, onClose, onSave,
}: {
  contact?: any; tipos: string[]; canales: string[];
  onClose: () => void; onSave: (d: any) => void;
}) {
  const isEdit = !!contact
  const [form, setForm] = useState({
    name: contact?.name || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    company: contact?.company || '',
    segment: contact?.segment || '',
    acquisition_channel: contact?.acquisition_channel || '',
  })
  const [phoneErr, setPhoneErr] = useState('')

  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const onPhoneChange = (raw: string) => {
    const digits = handlePhoneInput(raw)
    upd('phone', digits)
    setPhoneErr(digits.length > 0 && digits.length < 10 ? 'Debe tener 10 dígitos' : '')
  }
  const canSave = form.name.trim() && form.phone.length === 10 && !phoneErr
    && !!form.segment && !!form.acquisition_channel

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit ? 'Editar contacto' : 'Nuevo contacto'}</h3>
          <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nombre completo *</label>
            <input value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Nombre y apellidos o razón social" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Teléfono * <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(10 dígitos)</span></label>
              <input value={form.phone} onChange={e => onPhoneChange(e.target.value)} placeholder="222 000 0000"
                maxLength={10} inputMode="numeric" style={phoneErr ? { borderColor: 'var(--ipesa-rose)' } : undefined} />
              {phoneErr && <div style={{ color: 'var(--ipesa-rose)', fontSize: 11.5, marginTop: 4 }}>{phoneErr}</div>}
            </div>
            <div className="field"><label>Correo</label><input value={form.email} onChange={e => upd('email', e.target.value)} placeholder="cliente@correo.com" /></div>
          </div>
          <div className="field"><label>Empresa</label><input value={form.company} onChange={e => upd('company', e.target.value)} placeholder="Nombre de la empresa (opcional)" /></div>
          <SelectField label="Canal de adquisición" value={form.acquisition_channel} options={canales} onChange={v => upd('acquisition_channel', v)} required placeholder="— Seleccionar canal —" />
          <SelectField label="Tipo de cliente" value={form.segment} options={tipos} onChange={v => upd('segment', v)} required placeholder="— Seleccionar tipo —" />
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={() => { if (canSave) onSave(form) }}>
            <Ico.plus /> {isEdit ? 'Guardar cambios' : 'Guardar contacto'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Modal de exportación XLSX ── */
function ExportModal({ contacts, tipos, onClose }: { contacts: any[]; tipos: string[]; onClose: () => void }) {
  const [mode, setMode]       = useState<'all' | 'segment'>('all')
  const [segment, setSegment] = useState(tipos[0] || '')

  const count = mode === 'all' ? contacts.length : contacts.filter(c => c.segment === segment).length

  const doExport = async () => {
    const data = mode === 'all' ? contacts : contacts.filter(c => c.segment === segment)
    const rows = data.map(c => ({
      'Nombre':         c.name || '',
      'Teléfono':       normalizePhone(c.phone),
      'Para SMS (52+)': c.phone ? `52${normalizePhone(c.phone)}` : '',
      'Correo':         c.email || '',
      'Empresa':        c.company || '',
      'Tipo':           c.segment || '',
      'Canal':          c.acquisition_channel || '',
      'Dirección':      c.address || '',
      'Fecha registro': c.created_at?.slice(0, 10) || '',
    }))
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos')
    const suffix = mode === 'segment' ? `-${segment.toLowerCase().replace(/\s+/g, '-')}` : ''
    XLSX.writeFile(wb, `contactos-ipesa${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Exportar contactos</h3>
          <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 9, border: `2px solid ${mode === 'all' ? 'var(--ipesa-orange)' : 'var(--line)'}`, background: mode === 'all' ? 'rgba(238,90,36,0.05)' : 'var(--card)' }}>
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} style={{ accentColor: 'var(--ipesa-orange)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>Todos los contactos</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{contacts.length} contactos en total</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '12px 14px', borderRadius: 9, border: `2px solid ${mode === 'segment' ? 'var(--ipesa-orange)' : 'var(--line)'}`, background: mode === 'segment' ? 'rgba(238,90,36,0.05)' : 'var(--card)' }}>
              <input type="radio" checked={mode === 'segment'} onChange={() => setMode('segment')} style={{ accentColor: 'var(--ipesa-orange)', flexShrink: 0, marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>Por segmento</div>
                {mode === 'segment' ? (
                  <select value={segment} onChange={e => setSegment(e.target.value)} onClick={e => e.stopPropagation()}
                    style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                    {tipos.map(t => <option key={t} value={t}>{t} ({contacts.filter(c => c.segment === t).length})</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Filtrar por tipo de cliente</div>
                )}
              </div>
            </label>
          </div>
          <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--paper)', borderRadius: 8, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            Columnas incluidas: Nombre · Teléfono · Para SMS (52+) · Correo · Empresa · Tipo · Canal · Dirección · Fecha
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={doExport} disabled={count === 0}>
            <Ico.download /> Descargar {count} contactos
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Modal de importación CSV/XLSX (con previsualización y solo celulares) ── */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  type Step = 'drop' | 'map' | 'preview' | 'importing'
  const [step, setStep]         = useState<Step>('drop')
  const [rows, setRows]         = useState<any[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string, string>>({})
  const [progress, setProgress] = useState(0)
  const [total, setTotal]       = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError]       = useState('')
  const [preview, setPreview]   = useState<{
    valid: any[]; landlines: number; invalid: number; noName: number
  } | null>(null)

  const parseFile = async (file: File) => {
    setError('')
    if (file.name.match(/\.xlsx?$/i)) {
      const XLSX = await import('xlsx')
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
          if (data.length < 2) { setError('El archivo no tiene filas de datos.'); return }
          const hdrs = data[0].map(String)
          const dataRows = data.slice(1).map(row => {
            const obj: any = {}
            hdrs.forEach((h, i) => { obj[h] = row[i] ?? '' })
            return obj
          }).filter(r => Object.values(r).some(v => v !== ''))
          setHeaders(hdrs); setRows(dataRows); setStep('map')
        } catch { setError('No se pudo leer el archivo Excel.') }
      }
      reader.readAsBinaryString(file)
    } else {
      const Papa = (await import('papaparse')).default
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: res => {
          if (!res.data.length) { setError('El CSV no tiene datos.'); return }
          setHeaders(Object.keys(res.data[0] as object)); setRows(res.data as any[]); setStep('map')
        },
        error: () => setError('No se pudo leer el CSV.'),
      })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  const buildPreview = () => {
    let landlines = 0, invalid = 0, noName = 0
    const valid: any[] = []
    for (const row of rows) {
      const contact: any = {}
      CAMPOS_DESTINO.forEach(dest => {
        const src = mapping[dest]
        if (src && row[src] !== undefined) contact[dest] = String(row[src]).trim()
      })
      if (!contact.name?.trim()) { noName++; continue }
      const raw = contact.phone || ''
      const normalized = normalizePhone(raw)
      if (!raw || normalized.length !== 10) { invalid++; continue }
      if (!isMobilePhone(normalized)) { landlines++; continue }
      contact.phone = normalized
      valid.push(contact)
    }
    setPreview({ valid, landlines, invalid, noName })
    setStep('preview')
  }

  const doImport = async () => {
    if (!preview) return
    setStep('importing'); setTotal(preview.valid.length); setProgress(0)
    let done = 0
    for (const contact of preview.valid) {
      await fetch('/api/data/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      })
      done++; setProgress(done)
    }
    onDone()
  }

  const titleMap: Record<Step, string> = {
    drop: 'Importar contactos', map: 'Mapeo de columnas',
    preview: 'Previsualización', importing: 'Importando…',
  }

  return (
    <div className="modal" onClick={step === 'importing' ? undefined : onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{titleMap[step]}</h3>
          {step !== 'importing' && <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>}
        </div>
        <div className="modal-body">
          {step === 'drop' && (
            <>
              <label className={`import-drop ${dragging ? 'over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Arrastra un archivo CSV o Excel</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>o haz clic para seleccionar</div>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
              </label>
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--paper)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
                ℹ️ Solo se importarán números <strong>celulares</strong>. Los fijos y los inválidos se omiten automáticamente.
              </div>
              {error && <div style={{ color: 'var(--ipesa-rose)', fontSize: 13, marginTop: 10 }}>{error}</div>}
            </>
          )}
          {step === 'map' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                Asocia las columnas del archivo <strong>({rows.length} filas)</strong> con los campos de IPESA.
              </p>
              <div>
                {CAMPOS_DESTINO.map(dest => (
                  <div className="map-row" key={dest}>
                    <span className="map-label">{CAMPO_LABELS[dest]}{dest === 'name' || dest === 'phone' ? ' *' : ''}</span>
                    <select className="map-select" value={mapping[dest] || ''} onChange={e => setMapping(m => ({ ...m, [dest]: e.target.value }))}>
                      <option value="">— ignorar —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 'preview' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '14px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#16A34A', lineHeight: 1 }}>{preview.valid.length}</div>
                  <div style={{ fontSize: 12, color: '#166534', marginTop: 4, fontWeight: 600 }}>Celulares válidos</div>
                  <div style={{ fontSize: 11, color: '#4ADE80', marginTop: 2 }}>Se importarán ✓</div>
                </div>
                <div style={{ padding: '14px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#DC2626', lineHeight: 1 }}>{preview.landlines + preview.invalid + preview.noName}</div>
                  <div style={{ fontSize: 12, color: '#7F1D1D', marginTop: 4, fontWeight: 600 }}>Se omitirán</div>
                  <div style={{ fontSize: 11, color: '#FCA5A5', marginTop: 2 }}>No aptos para SMS</div>
                </div>
              </div>
              {(preview.landlines > 0 || preview.invalid > 0 || preview.noName > 0) && (
                <div style={{ padding: '10px 14px', background: 'var(--paper)', borderRadius: 9, fontSize: 12.5, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {preview.landlines > 0 && <span>📞 <strong>{preview.landlines}</strong> número{preview.landlines !== 1 ? 's' : ''} fijo{preview.landlines !== 1 ? 's' : ''}</span>}
                  {preview.invalid > 0  && <span>⚠️ <strong>{preview.invalid}</strong> teléfono{preview.invalid !== 1 ? 's' : ''} con formato inválido</span>}
                  {preview.noName > 0   && <span>👤 <strong>{preview.noName}</strong> fila{preview.noName !== 1 ? 's' : ''} sin nombre</span>}
                </div>
              )}
              {preview.valid.length === 0 && (
                <div style={{ padding: '12px', background: '#FEF2F2', borderRadius: 9, fontSize: 13, color: '#DC2626', textAlign: 'center', fontWeight: 500 }}>
                  No hay contactos válidos para importar en este archivo.
                </div>
              )}
            </div>
          )}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Importando {progress} de {total}…</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}></div></div>
            </div>
          )}
        </div>
        {step !== 'importing' && (
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={
              step === 'preview' ? () => setStep('map')
              : step === 'map' ? () => setStep('drop')
              : onClose
            }>
              {step === 'drop' ? 'Cancelar' : 'Volver'}
            </button>
            {step === 'map' && (
              <button className="btn btn-primary" onClick={buildPreview} disabled={!mapping.name && !mapping.phone}>
                Previsualizar →
              </button>
            )}
            {step === 'preview' && preview && preview.valid.length > 0 && (
              <button className="btn btn-primary" onClick={doImport}>
                <Ico.plus /> Importar {preview.valid.length} celulares
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
