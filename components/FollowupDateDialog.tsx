'use client'

import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { fmtDay } from '@/components/CommercialUI'
import { apiFetch } from '@/lib/apiClient'
import { notifyDataChanged } from '@/lib/crmEvents'
import { addDays, type CommercialContact } from '@/lib/commercial'
import s from './FollowupDateDialog.module.css'

type Target = { id: string; name: string; next_action: string | null; next_action_at: string | null }

const QUICK: [number, string][] = [[1, 'Mañana'], [3, 'En 3 días'], [7, 'En 1 semana'], [14, 'En 2 semanas']]

/**
 * Poner o cambiar la fecha del seguimiento sin registrar una actividad (ficha
 * de Comercial y Agenda). No cuenta para las metas; el historial del cliente
 * dice quién la cambió y de cuándo a cuándo.
 */
export function FollowupDateDialog({ open, contact, today, onSaved, onClose }: {
  open: boolean
  contact: Target
  today: string
  onSaved: (c: CommercialContact) => void
  onClose: () => void
}) {
  const current = contact.next_action_at
  const [date, setDate] = useState('')
  const [action, setAction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Cada vez que se abre: la fecha que tenía (si no ya pasó) o mañana
  useEffect(() => {
    if (!open) return
    setDate(current && current >= today ? current : addDays(today, 1))
    setAction(contact.next_action ?? '')
    setError('')
  }, [open, current, today, contact.next_action])

  async function save() {
    if (!date) { setError('Elige la fecha'); return }
    setBusy(true); setError('')
    try {
      const r = await apiFetch('/api/data/commercial/followup-date', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, next_action_at: date, next_action: action.trim() || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.contact) { setError(d.error || 'No se pudo guardar la fecha'); return }
      notifyDataChanged('commercial')
      onSaved(d.contact)
      onClose()
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      title={current ? 'Cambiar la fecha del seguimiento' : 'Poner fecha de seguimiento'}
      tone="warn" icon={CalendarClock}
      confirmLabel="Guardar fecha" busyLabel="Guardando…" busy={busy} error={error}
      onConfirm={save} onCancel={() => { if (!busy) onClose() }}
      field={
        <>
          <label>¿Cuándo?</label>
          <div className={s.quick} role="group" aria-label="Fecha del seguimiento">
            {QUICK.map(([days, label]) => {
              const value = addDays(today, days)
              return (
                <button key={days} type="button" aria-pressed={date === value} onClick={() => setDate(value)}>
                  {label}<small>{fmtDay(value)}</small>
                </button>
              )
            })}
          </div>
          <input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} aria-label="Fecha del seguimiento" />
          <label htmlFor={`fu-action-${contact.id}`} className={s.second}>¿Qué toca hacer? (opcional)</label>
          <input id={`fu-action-${contact.id}`} type="text" maxLength={200} value={action} placeholder="Dar seguimiento"
            onChange={e => setAction(e.target.value)} />
        </>
      }
    >
      <p>{contact.name}{current ? ` · hoy está para el ${fmtDay(current)}` : ''}.</p>
      <p>No cuenta como actividad; queda anotado en su historial.</p>
    </ConfirmDialog>
  )
}
