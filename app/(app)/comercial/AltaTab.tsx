'use client'

import { useMemo, useState } from 'react'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { findContactByPhone, loadSearchIndex, type IndexContact } from '@/lib/searchIndex'
import { apiFetch } from '@/lib/apiClient'
import { useCatalogs } from '@/lib/catalogs'
import { hasStreetNumber, parseColonia } from '@/lib/address'
import { ORIGINS, PRIORITIES, PRIORITY_INFO, type CommercialContact, type Priority } from '@/lib/commercial'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { Select, toOptions } from '@/components/Select'
import { phoneDigits } from '@/components/ContactFormModal'
import { segmentColor } from '@/components/CrmUI'
import type { Member } from './ui'
import s from './comercial.module.css'

const EMPTY = {
  nombre: '', apellido: '', company: '', phone: '', email: '', segment: '', acquisition_channel: '',
  address: '', colonia: '', postal_code: '', origin: '', potential: '', priority: 'media' as Priority, note: '',
}

/**
 * Alta de prospectos (hoja "Alta Prospectos" del Excel): avisa si el teléfono
 * ya existe y deja al prospecto listo en la cola de su responsable.
 */
export function AltaTab({ contacts, isAdmin, salesTeam, uid, team, onCreated }: {
  contacts: CommercialContact[]; isAdmin: boolean; salesTeam: boolean; uid: string; team: Member[]
  onCreated: (c: CommercialContact, callNow: boolean) => void
}) {
  const { segments, canales } = useCatalogs()
  const [form, setForm]     = useState(EMPTY)
  const [owner, setOwner]   = useState(uid)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const upd = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  // Toda la base de la tienda (el vendedor solo trabaja los suyos, pero el teléfono no se repite en la tienda)
  const [index, setIndex] = useState<IndexContact[]>([])
  useQueryEffect(() => { loadSearchIndex().then(i => setIndex(i.contacts)).catch(() => {}) }, [contacts.length])
  const duplicate = useMemo(() => findContactByPhone(index, form.phone), [index, form.phone])
  const phoneShort = form.phone.length > 0 && form.phone.length < 10
  const needSegment = segments.length > 0
  const needCanal = canales.length > 0
  const addressOk = !form.address.trim() || hasStreetNumber(form.address)
  const opt = (list: string[], current: string) => current && !list.includes(current) ? [current, ...list] : list

  const save = async (callNow: boolean) => {
    const name = [form.nombre.trim(), form.apellido.trim()].filter(Boolean).join(' ')
    if (!name) { setError('Escribe el nombre'); return }
    if (form.phone.length !== 10) { setError('El teléfono debe tener 10 dígitos'); return }
    if (duplicate) { setError('Ese teléfono ya está registrado'); return }
    if (needSegment && !form.segment) { setError('Elige el segmento'); return }
    if (needCanal && !form.acquisition_channel) { setError('Elige el canal'); return }
    const potential = form.potential.trim() ? Number(form.potential) : null
    if (potential !== null && (!Number.isFinite(potential) || potential < 0)) { setError('El potencial mensual no es válido'); return }

    setSaving(true); setError('')
    try {
      const r = await apiFetch('/api/data/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, phone: normalizePhone(form.phone), email: form.email.trim(), company: form.company.trim() || null,
          segment: form.segment || null, acquisition_channel: form.acquisition_channel,
          address: form.address.trim() || null, colonia: form.colonia.trim() || parseColonia(form.address) || null,
          postal_code: form.postal_code || null, origin: form.origin.trim() || null,
          potential_monthly: potential, priority: form.priority, note: form.note.trim() || undefined,
          ...(isAdmin && salesTeam ? { owner_id: owner || null } : {}),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar el prospecto'); return }
      const created = (Array.isArray(d) ? d[0] : d) as CommercialContact
      setForm(f => ({ ...EMPTY, segment: f.segment, acquisition_channel: f.acquisition_channel, origin: f.origin }))
      onCreated({ ...created, last_activity_at: null, last_result: null, no_answer_streak: 0 }, callNow)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally { setSaving(false) }
  }

  return (
    <div className={s.panel} style={{ maxWidth: 860 }}>
      <h4>Nuevo prospecto</h4>
      <div className={s.formGrid}>
        <div className="field"><label htmlFor="al-nombre">Nombre *</label><input id="al-nombre" value={form.nombre} onChange={e => upd('nombre', e.target.value)} maxLength={120} /></div>
        <div className="field"><label htmlFor="al-apellido">Apellido</label><input id="al-apellido" value={form.apellido} onChange={e => upd('apellido', e.target.value)} maxLength={80} /></div>
        <div className="field"><label htmlFor="al-company">Negocio o empresa</label><input id="al-company" value={form.company} onChange={e => upd('company', e.target.value)} maxLength={200} /></div>

        <div className="field">
          <label htmlFor="al-phone">Teléfono * <span className="label-muted">(10 dígitos)</span></label>
          <input id="al-phone" value={form.phone} onChange={e => upd('phone', phoneDigits(e.target.value))} inputMode="numeric" maxLength={10}
            placeholder="222 000 0000" aria-invalid={phoneShort || !!duplicate} style={phoneShort || duplicate ? { borderColor: 'var(--danger)' } : undefined} />
          {phoneShort && <div className="field-error">Faltan {10 - form.phone.length} dígitos</div>}
          {duplicate && <div className="field-error">Ya está registrado: <strong>{duplicate.company?.trim() || duplicate.name}</strong> ({fmtPhone(duplicate.phone)})</div>}
        </div>
        <div className="field"><label htmlFor="al-email">Correo</label><input id="al-email" type="email" value={form.email} onChange={e => upd('email', e.target.value)} maxLength={254} placeholder="cliente@correo.com" /></div>
        <div className="field">
          <label>Segmento{needSegment ? ' *' : ''}</label>
          <Select value={form.segment} onChange={v => upd('segment', v)} aria-label="Segmento" options={toOptions(opt(segments, form.segment), segmentColor)} placeholder="Elegir segmento" />
        </div>

        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label htmlFor="al-address">Dirección con número</label>
          <input id="al-address" value={form.address} onChange={e => upd('address', e.target.value)} maxLength={500} placeholder="Calle, número, colonia" />
          {!addressOk && <div className="field-error" style={{ color: 'var(--warning)' }}>Sin número de calle: quedará en "Por depurar" hasta completarla.</div>}
        </div>
        <div className="field"><label htmlFor="al-colonia">Colonia</label><input id="al-colonia" value={form.colonia} onChange={e => upd('colonia', e.target.value)} maxLength={120} placeholder={parseColonia(form.address) ?? ''} /></div>

        <div className="field">
          <label>Canal{needCanal ? ' *' : ''}</label>
          <Select value={form.acquisition_channel} onChange={v => upd('acquisition_channel', v)} aria-label="Canal" options={toOptions(opt(canales, form.acquisition_channel))} placeholder="¿Cómo nos conoció?" />
        </div>
        <div className="field">
          <label htmlFor="al-origin">Origen</label>
          <input id="al-origin" list="al-origins" value={form.origin} onChange={e => upd('origin', e.target.value)} maxLength={60} placeholder="Visita de campo, llamada…" />
          <datalist id="al-origins">{ORIGINS.map(o => <option key={o} value={o} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="al-pot">Potencial mensual (MXN)</label><input id="al-pot" type="number" min="0" inputMode="decimal" value={form.potential} onChange={e => upd('potential', e.target.value)} placeholder="0" /></div>

        <div className="field">
          <label>Prioridad</label>
          <Select value={form.priority} onChange={v => upd('priority', v as Priority)} aria-label="Prioridad"
            options={PRIORITIES.map(p => ({ value: p, label: PRIORITY_INFO[p].label, color: PRIORITY_INFO[p].color }))} />
        </div>
        {isAdmin && salesTeam && (
          <div className="field">
            <label>Responsable</label>
            <Select value={owner} onChange={setOwner} aria-label="Responsable"
              options={[...team.map(m => ({ value: m.user_id, label: m.user_id === uid ? `${m.name} (tú)` : m.name })), { value: '', label: 'Sin asignar' }]} />
          </div>
        )}
        <div className="field"><label htmlFor="al-cp">C.P.</label><input id="al-cp" value={form.postal_code} onChange={e => upd('postal_code', e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} /></div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="al-note">Observaciones</label>
          <textarea id="al-note" rows={2} value={form.note} onChange={e => upd('note', e.target.value)} maxLength={2000} placeholder="Qué necesita, cuándo compra, quién decide…" />
        </div>
      </div>
      {error && <div className="field-error" style={{ marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={saving}>Guardar y llamar ahora</button>
      </div>
    </div>
  )
}
