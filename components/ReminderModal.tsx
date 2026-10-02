'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PRIORITY_INFO, REMINDER_PRIORITIES, REMINDER_TYPES, REMINDER_TYPE_INFO,
  type Reminder, type ReminderPriority, type ReminderType,
} from '@/lib/crm'
import type { ReminderDefaults } from '@/lib/crmEvents'
import { QUICK_WHEN, localNow, quickDate, toDbLocal, type QuickWhen } from '@/lib/datetime'
import { loadSearchIndex, normText, type IndexLead } from '@/lib/searchIndex'

const CloseIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}><path d="M18 6 6 18M6 6l12 12" /></svg>

/**
 * Formulario único para crear o editar un recordatorio (Agenda, campana,
 * ficha de lead, ficha de contacto e Inicio usan este mismo).
 */
export default function ReminderModal({ reminder, defaults, onClose, onSaved }: {
  reminder?: Reminder
  defaults?: ReminderDefaults
  onClose: () => void
  onSaved: (r: Reminder) => void
}) {
  const editing = !!reminder
  const initialSubject = reminder
    ? (!reminder.lead_id && reminder.lead_name && reminder.lead_name !== reminder.nota ? reminder.lead_name : '')
    : (!defaults?.lead_id && defaults?.lead_name ? defaults.lead_name : '')

  const [type, setType]         = useState<ReminderType>((reminder?.type as ReminderType) || defaults?.type || 'task')
  const [priority, setPriority] = useState<ReminderPriority>((reminder?.priority as ReminderPriority) || 'medium')
  const [fecha, setFecha]       = useState(reminder?.fecha_recordatorio?.slice(0, 16) || defaults?.fecha || quickDate('tomorrow'))
  const [nota, setNota]         = useState(reminder?.nota ?? defaults?.nota ?? '')
  const [leadId, setLeadId]     = useState<string | null>(reminder?.lead_id ?? defaults?.lead_id ?? null)
  const [leadName, setLeadName] = useState((reminder?.lead_id ? reminder.lead_name : defaults?.lead_id ? defaults.lead_name : '') ?? '')
  const [subject, setSubject]   = useState(initialSubject)
  const [leadQ, setLeadQ]       = useState('')
  const [leads, setLeads]       = useState<IndexLead[]>([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const notaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setTimeout(() => notaRef.current?.focus(), 80) }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving])
  useEffect(() => { loadSearchIndex().then(i => setLeads(i.leads)) }, [])

  const leadMatches = useMemo(() => {
    const q = normText(leadQ)
    return q ? leads.filter(l => normText(l.name).includes(q)).slice(0, 6) : []
  }, [leads, leadQ])

  const activeQuick = QUICK_WHEN.find(w => quickDate(w.key) === fecha)?.key
  const canSave = fecha.length >= 16 && (!!nota.trim() || !!leadId || !!subject) && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError('')
    const body = {
      nota: nota.trim(),
      fecha_recordatorio: toDbLocal(fecha),
      type, priority,
      lead_id: leadId,
      lead_name: leadId ? leadName : (subject || nota.trim()),
    }
    try {
      const r = await fetch(editing ? `/api/data/reminders/${reminder!.id}` : '/api/data/reminders', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar el recordatorio'); return }
      onSaved(d as Reminder)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="rem-modal-title">
        <div className="modal-head">
          <h3 id="rem-modal-title">{editing ? 'Editar recordatorio' : 'Nuevo recordatorio'}</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><CloseIcon /></button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label htmlFor="rem-nota">¿Qué hay que hacer?</label>
            <textarea id="rem-nota" ref={notaRef} rows={2} maxLength={1000} value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Ej. Llamar para confirmar la cotización de impermeabilizante" />
          </div>

          <div className="field">
            <label>Cuándo</label>
            <div className="pill-group" style={{ marginBottom: 8 }}>
              {QUICK_WHEN.map(w => (
                <button key={w.key} type="button" className={`quick-chip ${activeQuick === w.key ? 'active' : ''}`}
                  onClick={() => setFecha(quickDate(w.key as QuickWhen))}>
                  {w.label}
                </button>
              ))}
            </div>
            <input type="datetime-local" value={fecha} min={editing ? undefined : localNow()} onChange={e => setFecha(e.target.value)} aria-label="Fecha y hora" />
          </div>

          <div className="field">
            <label>Tipo</label>
            <div className="pill-group">
              {REMINDER_TYPES.map(t => {
                const info = REMINDER_TYPE_INFO[t]
                return (
                  <button key={t} type="button" className={`choice-pill ${type === t ? 'active' : ''}`} onClick={() => setType(t)}
                    style={{ '--pill-color': info.color, '--pill-bg': info.bg } as React.CSSProperties}>
                    <span aria-hidden="true">{info.emoji}</span> {info.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="field">
            <label>Prioridad</label>
            <div className="pill-group">
              {REMINDER_PRIORITIES.map(p => {
                const info = PRIORITY_INFO[p]
                return (
                  <button key={p} type="button" className={`choice-pill ${priority === p ? 'active' : ''}`} onClick={() => setPriority(p)}
                    style={{ '--pill-color': info.color, '--pill-bg': info.bg } as React.CSSProperties}>
                    {info.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Lead o cliente <span className="label-muted">(opcional)</span></label>
            {leadId ? (
              <div className="linked-chip">
                <span>Lead · <strong>{leadName}</strong></span>
                <button type="button" onClick={() => { setLeadId(null); setLeadName('') }} aria-label="Quitar lead">×</button>
              </div>
            ) : subject ? (
              <div className="linked-chip neutral">
                <span>Cliente · <strong>{subject}</strong></span>
                <button type="button" onClick={() => setSubject('')} aria-label="Quitar cliente">×</button>
              </div>
            ) : (
              <div className="picker-search">
                <input value={leadQ} onChange={e => setLeadQ(e.target.value)} placeholder="Buscar un lead por nombre…" aria-label="Buscar lead" />
                {leadMatches.length > 0 && (
                  <div className="picker-results" role="listbox">
                    {leadMatches.map(l => (
                      <button key={l.id} type="button" role="option" aria-selected="false"
                        onClick={() => { setLeadId(l.id); setLeadName(l.name); setLeadQ('') }}>
                        <strong>{l.name}</strong><small>{l.estado}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!canSave}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear recordatorio'}
          </button>
        </div>
      </div>
    </div>
  )
}
