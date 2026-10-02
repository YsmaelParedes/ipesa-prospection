'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useCatalogs } from '@/lib/catalogs'
import type { ContactLite } from '@/lib/crm'
import { findContactByPhone, loadSearchIndex, type IndexContact } from '@/lib/searchIndex'
import { fmtPhone, normalizePhone } from '@/lib/phone'

const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}><path d="M18 6 6 18M6 6l12 12" /></svg>

/** Solo dígitos, sin el 52 del país, máximo 10. */
export function phoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length > 10) digits = digits.slice(2)
  return digits.slice(0, 10)
}

/**
 * Alta de contacto (la usan Contactos, el botón "+ Nuevo", el buscador y el
 * alta de un lead). Avisa si el teléfono ya es de otro contacto antes de guardar.
 */
export default function ContactFormModal({ initialName = '', initialPhone = '', onClose, onSaved }: {
  initialName?: string
  initialPhone?: string
  onClose: () => void
  onSaved: (c: ContactLite) => void
}) {
  const { segments, canales } = useCatalogs()
  const [form, setForm] = useState({
    name: initialName, phone: phoneDigits(initialPhone), email: '', company: '',
    segment: '', acquisition_channel: '', address: '', postal_code: '',
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [contacts, setContacts] = useState<IndexContact[]>([])
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 80) }, [])
  useEffect(() => { loadSearchIndex().then(i => setContacts(i.contacts)) }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving])

  const upd = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const duplicate = findContactByPhone(contacts, form.phone)
  const phoneShort = form.phone.length > 0 && form.phone.length < 10
  // Con catálogos configurados, segmento y canal son obligatorios (sirven para filtrar campañas)
  const needSegment = segments.length > 0
  const needCanal = canales.length > 0
  const canSave = form.name.trim().length > 0 && form.phone.length === 10 && !duplicate
    && (!needSegment || !!form.segment) && (!needCanal || !!form.acquisition_channel) && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/data/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim(), phone: normalizePhone(form.phone) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar el contacto'); return }
      const created = Array.isArray(d) ? d[0] : d
      onSaved(created as ContactLite)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
        <div className="modal-head">
          <h3 id="contact-modal-title">Nuevo contacto</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="c-name">Nombre *</label>
            <input id="c-name" ref={nameRef} value={form.name} onChange={e => upd('name', e.target.value)} maxLength={200} placeholder="Nombre y apellido o razón social" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="c-phone">Celular * <span className="label-muted">(10 dígitos)</span></label>
              <input id="c-phone" value={form.phone} onChange={e => upd('phone', phoneDigits(e.target.value))} inputMode="numeric" maxLength={10}
                placeholder="222 000 0000" aria-invalid={phoneShort || !!duplicate} style={phoneShort || duplicate ? { borderColor: 'var(--danger)' } : undefined} />
              {phoneShort && <div className="field-error">Faltan {10 - form.phone.length} dígitos</div>}
              {duplicate && (
                <div className="field-error">
                  Ya es de <strong>{duplicate.name}</strong> ({fmtPhone(duplicate.phone)}) ·{' '}
                  <Link href={`/contactos?id=${duplicate.id}`} onClick={onClose} style={{ textDecoration: 'underline' }}>Ver su ficha</Link>
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="c-email">Correo</label>
              <input id="c-email" type="email" value={form.email} onChange={e => upd('email', e.target.value)} maxLength={254} placeholder="cliente@correo.com" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="c-segment">Segmento{needSegment ? ' *' : ''}</label>
              <select id="c-segment" value={form.segment} onChange={e => upd('segment', e.target.value)}>
                <option value="">{segments.length ? '— Elegir —' : 'Sin segmentos'}</option>
                {segments.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-canal">¿Cómo nos conoció?{needCanal ? ' *' : ''}</label>
              <select id="c-canal" value={form.acquisition_channel} onChange={e => upd('acquisition_channel', e.target.value)}>
                <option value="">{canales.length ? '— Elegir —' : 'Sin canales'}</option>
                {canales.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {!needSegment && !needCanal && (
            <div className="field-hint" style={{ marginTop: -6, marginBottom: 12 }}>
              Agrega segmentos y canales en Configuración → Catálogos para clasificar a tus clientes.
            </div>
          )}

          {moreOpen ? (
            <>
              <div className="field">
                <label htmlFor="c-company">Empresa</label>
                <input id="c-company" value={form.company} onChange={e => upd('company', e.target.value)} maxLength={200} placeholder="Opcional" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="c-address">Dirección</label>
                  <input id="c-address" value={form.address} onChange={e => upd('address', e.target.value)} maxLength={500} />
                </div>
                <div className="field">
                  <label htmlFor="c-cp">C.P.</label>
                  <input id="c-cp" value={form.postal_code} onChange={e => upd('postal_code', e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} />
                </div>
              </div>
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => setMoreOpen(true)}>+ Empresa y dirección</button>
          )}

          {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!canSave}>{saving ? 'Guardando…' : 'Guardar contacto'}</button>
        </div>
      </div>
    </div>
  )
}
