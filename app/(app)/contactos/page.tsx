'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Avatar, TipoChip, CanalChip, fmtDateLong, fmtPhone, normalizePhone } from '@/components/IpesaUI'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

/* ── Iconos ── */
const Ico = {
  close:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  phone:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  mail:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  upload:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  chevron: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><path d="m9 18 6-6-6-6"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>,
  edit:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
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
  const [showImport, setShowImport]   = useState(false)
  const [createLeadFor, setCreateLeadFor] = useState<any | null>(null)
  const [toast, setToast]             = useState('')

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

  const filtered = contacts.filter(c => {
    if (tipoFiltro !== 'Todos' && c.segment !== tipoFiltro) return false
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

  return (
    <>
      <div className="section-head">
        <h2>Base de contactos</h2>
        <span className="count">{filtered.length} de {contacts.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}>
            <Ico.upload /> Importar
          </button>
        </div>
      </div>

      <div className="filter-bar">
        {['Todos', ...tipos].map(t => (
          <button key={t} className={`filter-pill ${tipoFiltro === t ? 'active' : ''}`} onClick={() => setTipoFiltro(t)}>
            {t === 'Todos' ? 'Todos los tipos' : t}
            <span className="count">{countFor(t)}</span>
          </button>
        ))}
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
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Canal</th>
                <th>Tipo</th>
                <th>Fecha de registro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)}>
                  <td>
                    <div className="cell-name">
                      <Avatar name={c.name} color={TIPO_COLORS[c.segment]} size={32} />
                      <div>
                        <div className="nm">{c.name}</div>
                        <div className="em">{c.company || c.email || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Teléfono" className="cell-mono">{fmtPhone(c.phone)}</td>
                  <td data-label="Canal">
                    {c.acquisition_channel ? <CanalChip value={c.acquisition_channel} small /> : <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>—</span>}
                  </td>
                  <td data-label="Tipo"><TipoChip value={c.segment || '—'} /></td>
                  <td data-label="Registro" className="cell-muted">{fmtDateLong(c.created_at?.slice(0, 10) || '')}</td>
                  <td className="cell-chevron" style={{ width: 40, textAlign: 'right' }}><Ico.chevron /></td>
                </tr>
              ))}
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
          onCreateLead={(c) => { setSelected(null); setCreateLeadFor(c) }}
          onUpdated={handleContactUpdated}
          onDeleted={handleContactDeleted}
        />
      )}

      {createLeadFor && (
        <NewLeadFromContact
          contact={createLeadFor}
          canales={canales}
          tipos={tipos}
          onClose={() => setCreateLeadFor(null)}
          onSave={async (form) => {
            const r = await fetch('/api/data/leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form),
            })
            if (r.ok) { showToast('Lead creado ✓'); load() }
            else showToast('Error al crear lead')
            setCreateLeadFor(null)
          }}
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
  contact: c, tipos, canales, onClose, onCreateLead, onUpdated, onDeleted,
}: {
  contact: any; tipos: string[]; canales: string[];
  onClose: () => void; onCreateLead: (c: any) => void;
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
      .then(d => setLeads((d.leads || []).filter((l: any) => l.contact_id === c.id || l.email === c.email || l.phone === c.phone)))
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
            {c.phone && <a href={`tel:${normalizePhone(c.phone)}`} className="btn btn-ghost"><Ico.phone /> Llamar</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn btn-ghost"><Ico.mail /> Correo</a>}
            <button className="btn btn-ghost" onClick={() => { setEditing(true); setConfirmDel(false) }} style={{ color: 'var(--ink-2)' }}>
              <Ico.edit /> Editar
            </button>
            <button className="btn btn-ghost" onClick={() => { setConfirmDel(true); setEditing(false) }} style={{ color: 'var(--ipesa-rose)' }}>
              <Ico.trash /> Eliminar
            </button>
            <button className="btn btn-primary" onClick={() => onCreateLead(c)}>
              <Ico.plus /> Crear lead
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

/* ── Modal: crear lead desde contacto ── */
function NewLeadFromContact({ contact: c, canales, tipos, onClose, onSave }: { contact: any; canales: string[]; tipos: string[]; onClose: () => void; onSave: (d: any) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    canal:    c.acquisition_channel || canales[0] || 'Referido',
    segmento: c.segment             || tipos[0]  || 'Hogar',
    monto:    '',
    fecha:    today,
    notas:    '',
  })
  const [saving, setSaving] = useState(false)
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const selectStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }

  const handleSave = async () => {
    setSaving(true)
    await onSave({ name: c.name, phone: c.phone, email: c.email || '', contact_id: c.id,
      canal: form.canal, segmento: form.segmento, estado: 'Nuevo',
      monto: form.monto ? Number(form.monto) : null, fecha: form.fecha, notas: form.notas || null })
    setSaving(false)
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Crear lead</h3>
          <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Contacto de origen</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{c.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 10 }}>
              {c.phone && <span>{fmtPhone(c.phone)}</span>}
              {c.email && <span>{c.email}</span>}
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Canal</label>
              <select value={form.canal} onChange={e => upd('canal', e.target.value)} style={selectStyle}>
                {canales.map(ch => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Segmento</label>
              <select value={form.segmento} onChange={e => upd('segmento', e.target.value)} style={selectStyle}>
                {tipos.map(t => <option key={t} value={t}>{t}</option>)}
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
              placeholder="Observaciones, producto de interés, etc." rows={3} style={{ resize: 'vertical', minHeight: 72 }} />
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

/* ── Modal de importación CSV/XLSX ── */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep]         = useState<'drop'|'map'|'import'>('drop')
  const [rows, setRows]         = useState<any[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string,string>>({})
  const [progress, setProgress] = useState(0)
  const [total, setTotal]       = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError]       = useState('')

  const parseFile = (file: File) => {
    setError('')
    if (file.name.match(/\.xlsx?$/i)) {
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

  const doImport = async () => {
    setStep('import'); setTotal(rows.length); setProgress(0)
    let done = 0
    for (const row of rows) {
      const contact: any = {}
      CAMPOS_DESTINO.forEach(dest => {
        const src = mapping[dest]
        if (src && row[src] !== undefined) contact[dest] = String(row[src]).trim()
      })
      if (!contact.name) { done++; setProgress(done); continue }
      if (contact.phone) contact.phone = normalizePhone(contact.phone)
      await fetch('/api/data/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact) })
      done++; setProgress(done)
    }
    onDone()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{step === 'drop' ? 'Importar contactos' : step === 'map' ? 'Mapeo de columnas' : 'Importando…'}</h3>
          <button className="modal-close btn-icon" onClick={onClose}><Ico.close /></button>
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
              {error && <div style={{ color: 'var(--ipesa-rose)', fontSize: 13, marginTop: 10 }}>{error}</div>}
            </>
          )}
          {step === 'map' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Asocia las columnas ({rows.length} filas) con los campos de IPESA.</p>
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
          {step === 'import' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Importando {progress} de {total}…</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${(progress/total)*100}%` }}></div></div>
            </div>
          )}
        </div>
        {step !== 'import' && (
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={step === 'map' ? () => setStep('drop') : onClose}>
              {step === 'map' ? 'Volver' : 'Cancelar'}
            </button>
            {step === 'map' && (
              <button className="btn btn-primary" onClick={doImport} disabled={!mapping.name && !mapping.phone}>
                <Ico.plus /> Importar {rows.length} contactos
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
