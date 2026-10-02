'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Avatar, EstadoChip } from '@/components/CrmUI'
import ContactFormModal from '@/components/ContactFormModal'
import { useCatalogs } from '@/lib/catalogs'
import { isOpenLead, type ContactLite } from '@/lib/crm'
import { loadSearchIndex, searchContacts, type IndexContact, type IndexLead } from '@/lib/searchIndex'
import { fmtPhone, normalizePhone } from '@/lib/phone'

const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}><path d="M18 6 6 18M6 6l12 12" /></svg>

export type CreatedLead = { id: string; name: string }

/**
 * Alta de lead en dos pasos: elegir al cliente (o darlo de alta ahí mismo) y
 * capturar la oportunidad. Si el cliente ya viene dado (ficha de contacto,
 * WhatsApp) se salta el primer paso.
 */
export default function LeadCreateModal({ contact: fixedContact, onClose, onSaved }: {
  contact?: ContactLite
  onClose: () => void
  onSaved: (lead: CreatedLead) => void
}) {
  const { segments, canales } = useCatalogs()
  const [contact, setContact]   = useState<ContactLite | null>(fixedContact ?? null)
  const [creatingContact, setCreatingContact] = useState(false)
  const [query, setQuery]       = useState('')
  const [contacts, setContacts] = useState<IndexContact[] | null>(null)
  const [leads, setLeads]       = useState<IndexLead[]>([])
  const [form, setForm] = useState({ canal: '', segmento: '', monto: '', fecha: new Date().toLocaleDateString('en-CA'), notas: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSearchIndex().then(i => { setContacts(i.contacts); setLeads(i.leads) }) }, [])
  useEffect(() => { if (!contact) setTimeout(() => searchRef.current?.focus(), 80) }, [contact])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !creatingContact) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving, creatingContact])

  // Al elegir cliente: canal y segmento salen de su ficha
  useEffect(() => {
    if (!contact) return
    setForm(f => ({
      ...f,
      canal: contact.acquisition_channel || f.canal || canales[0] || '',
      segmento: contact.segment || f.segmento || segments[0] || '',
    }))
  }, [contact, canales, segments])

  const results = useMemo(() => {
    if (!contacts) return []
    return query.trim() ? searchContacts(contacts, query, 40) : contacts.slice(0, 40)
  }, [contacts, query])

  // Oportunidades que el cliente ya tiene abiertas (para no duplicar)
  const openLeads = useMemo(() => {
    if (!contact) return []
    const phone = normalizePhone(contact.phone)
    return leads.filter(l => isOpenLead(l.estado) && (l.contact_id === contact.id || (!!phone && normalizePhone(l.phone) === phone)))
  }, [contact, leads])

  const typedDigits = query.replace(/\D/g, '')
  const newContactSeed = typedDigits.length >= 7 ? { name: '', phone: typedDigits } : { name: query.trim(), phone: '' }

  const save = async () => {
    if (!contact || saving) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/data/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contact.name, phone: contact.phone, email: contact.email || '', contact_id: contact.id,
          canal: form.canal || 'Otro', segmento: form.segmento || '', estado: 'Nuevo',
          monto: form.monto ? Number(form.monto) : null, fecha: form.fecha, notas: form.notas.trim() || null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo crear el lead'); return }
      const created = Array.isArray(d) ? d[0] : d
      onSaved({ id: created.id, name: created.name })
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (creatingContact) {
    return (
      <ContactFormModal
        initialName={newContactSeed.name}
        initialPhone={newContactSeed.phone}
        onClose={() => setCreatingContact(false)}
        onSaved={c => { setCreatingContact(false); setContact(c) }}
      />
    )
  }

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
        <div className="modal-head">
          <h3 id="lead-modal-title">{contact ? 'Nuevo lead' : '¿Para qué cliente es?'}</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>

        {!contact ? (
          <>
            <div className="modal-search">
              <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, teléfono o empresa…" aria-label="Buscar cliente" />
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <button className="pick-row pick-row-new" onClick={() => setCreatingContact(true)}>
                <span className="pick-row-plus">+</span>
                <span className="pick-row-main">
                  <strong>{query.trim() ? `Crear contacto “${query.trim()}”` : 'Crear un contacto nuevo'}</strong>
                  <small>Si el cliente aún no está registrado</small>
                </span>
              </button>
              {contacts === null ? (
                <div className="pick-empty"><span className="wa-spinner" /></div>
              ) : results.length === 0 ? (
                <div className="pick-empty">Ningún contacto coincide con “{query}”.</div>
              ) : results.map(c => (
                <button key={c.id} className="pick-row" onClick={() => setContact(c)}>
                  <Avatar name={c.name} size={34} />
                  <span className="pick-row-main">
                    <strong>{c.name}</strong>
                    <small>{fmtPhone(c.phone)}{c.company ? ` · ${c.company}` : ''}{c.segment ? ` · ${c.segment}` : ''}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <div className="picked-contact">
                <Avatar name={contact.name} size={38} />
                <span className="pick-row-main">
                  <strong>{contact.name}</strong>
                  <small>{fmtPhone(contact.phone)}{contact.company ? ` · ${contact.company}` : ''}</small>
                </span>
                {!fixedContact && <button type="button" className="link-btn" onClick={() => setContact(null)}>Cambiar</button>}
              </div>

              {openLeads.length > 0 && (
                <div className="soft-note">
                  Este cliente ya tiene {openLeads.length === 1 ? 'un lead abierto' : `${openLeads.length} leads abiertos`}:{' '}
                  {openLeads.slice(0, 2).map((l, i) => (
                    <span key={l.id}>{i > 0 && ', '}<Link href={`/leads?id=${l.id}`} onClick={onClose}><EstadoChip value={l.estado} small /></Link>{l.monto ? ` $${Number(l.monto).toLocaleString('es-MX')}` : ''}</span>
                  ))}
                  . Registra uno nuevo solo si es otra compra.
                </div>
              )}

              <div className="field-row">
                <div className="field">
                  <label htmlFor="l-canal">Canal</label>
                  <select id="l-canal" value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>
                    {!canales.includes(form.canal) && <option value={form.canal}>{form.canal || '— Elegir —'}</option>}
                    {canales.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="l-seg">Segmento</label>
                  <select id="l-seg" value={form.segmento} onChange={e => setForm(f => ({ ...f, segmento: e.target.value }))}>
                    {!segments.includes(form.segmento) && <option value={form.segmento}>{form.segmento || '— Elegir —'}</option>}
                    {segments.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="l-monto">Valor estimado (MXN)</label>
                  <input id="l-monto" type="number" min="0" inputMode="decimal" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" />
                </div>
                <div className="field">
                  <label htmlFor="l-fecha">Fecha</label>
                  <input id="l-fecha" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="l-notas">¿Qué necesita?</label>
                <textarea id="l-notas" rows={3} maxLength={5000} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Producto, color, m², fecha de obra…" />
              </div>
              {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Creando…' : 'Crear lead'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
