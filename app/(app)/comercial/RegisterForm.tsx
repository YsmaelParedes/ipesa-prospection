'use client'

import { useRef, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import {
  RESULT_CHOICES, RESULT_RULES, addDays, outcomeText, suggestNext,
  type CommercialContact, type ResultChoice,
} from '@/lib/commercial'
import { Ico, fmtDay } from './ui'
import s from './comercial.module.css'

export type Kind = 'llamada' | 'whatsapp' | 'visita'

const KINDS: [Kind, string][] = [['llamada', '📞 Llamada'], ['whatsapp', '💬 WhatsApp'], ['visita', '📍 Visita']]
const RESULT_LOOK: Record<ResultChoice, { icon: string; bg: string; short?: string }> = {
  no_contesta:       { icon: '🔕', bg: 'var(--paper-2)' },
  contactado:        { icon: '🙂', bg: 'var(--c-teal-soft)' },
  cotizacion:        { icon: '📄', bg: 'var(--warning-soft)', short: 'Cotización' },
  venta:             { icon: '💰', bg: 'var(--success-soft)' },
  no_interesado:     { icon: '✋', bg: 'var(--paper-2)' },
  numero_equivocado: { icon: '⚠️', bg: 'var(--danger-soft)', short: 'Núm. incorrecto' },
}

/** Fecha sugerida y atajos: "En 2 días · sáb 25", "Mañana", "En 1 semana". */
function dateChoices(result: ResultChoice, today: string): { value: string; label: string }[] {
  const suggested = suggestNext(result, today).nextAt
  const out: { value: string; label: string }[] = []
  const add = (value: string, label: string) => { if (!out.some(o => o.value === value)) out.push({ value, label }) }
  if (suggested) {
    const days = RESULT_RULES[result].days ?? 1
    add(suggested, days === 1 ? `Mañana · ${fmtDay(suggested)}` : `En ${days} días · ${fmtDay(suggested)}`)
  }
  if (result !== 'no_interesado') {
    add(addDays(today, 1), 'Mañana')
    add(addDays(today, 7), 'En 1 semana')
  }
  return out
}

/**
 * Registrar una actividad en 3 pasos: tipo → resultado (con monto si es
 * cotización o venta) → nota y fecha sugerida. Al guardar, el contacto pasa
 * al avance que corresponde y quien lo registra se queda con él si no tenía dueño.
 */
export function RegisterForm({ contact, today, initialKind = 'llamada', initialResult, wide, onSaved, nextName }: {
  contact: CommercialContact
  today: string
  initialKind?: Kind
  initialResult?: ResultChoice
  /** Resultados en 3 columnas (ficha de la computadora). */
  wide?: boolean
  onSaved: (contact: CommercialContact) => void
  /** Nombre del siguiente de la lista (para el botón). */
  nextName?: string
}) {
  const [kind, setKind] = useState<Kind>(initialKind)
  const [result, setResult] = useState<ResultChoice | null>(initialResult ?? null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [nextAt, setNextAt] = useState(initialResult ? suggestNext(initialResult, today).nextAt ?? '' : '')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const rule = result ? RESULT_RULES[result] : null
  const asksAmount = result === 'cotizacion' || result === 'venta'
  const choices = result ? dateChoices(result, today) : []
  const needsDate = !!result && result !== 'numero_equivocado'

  function pick(r: ResultChoice) {
    setResult(r)
    setNextAt(suggestNext(r, today).nextAt ?? '')
    setPicking(false)
    setError('')
    if (r !== 'cotizacion' && r !== 'venta') setAmount('')
  }

  async function save() {
    if (!result) { setError('Elige cómo te fue'); return }
    const value = amount.trim() ? Number(amount.replace(/[,$\s]/g, '')) : null
    if (value !== null && (!Number.isFinite(value) || value < 0)) { setError('El monto no es válido'); return }
    if (asksAmount && !value) { setError(result === 'venta' ? 'Escribe el monto de la venta' : 'Escribe el monto de la cotización'); return }
    if (needsDate && !nextAt) { setError('Elige cuándo volver a contactar'); return }
    setSaving(true); setError('')
    try {
      const r = await apiFetch('/api/data/commercial/activities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contact.id, kind, result,
          note: note.trim() || null,
          quote_amount: result === 'cotizacion' ? value : null,
          sale_amount: result === 'venta' ? value : null,
          next_action: needsDate ? rule?.action ?? 'Dar seguimiento' : null,
          next_action_at: needsDate ? nextAt : null,
          status: rule?.status ?? null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar'); return }
      setResult(null); setAmount(''); setNote(''); setNextAt('')
      onSaved(d.contact ?? contact)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className={s.step}>
        <div className={s.stepHead}><span className={s.stepN}>1</span>Tipo</div>
        <div className={s.typeSeg} role="group" aria-label="Tipo de actividad">
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" className={s.press} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className={s.step}>
        <div className={s.stepHead}><span className={s.stepN}>2</span>Resultado</div>
        <div className={`${s.results} ${wide ? s.wideResults : ''}`} role="group" aria-label="Resultado">
          {RESULT_CHOICES.map(r => (
            <button key={r} type="button" className={`${s.chipPick} ${s.press}`} aria-pressed={result === r} onClick={() => pick(r)}>
              <span className={s.chipIco} style={{ background: RESULT_LOOK[r].bg }} aria-hidden="true">{RESULT_LOOK[r].icon}</span>
              {(wide && RESULT_LOOK[r].short) || (r === 'cotizacion' ? 'Cotización enviada' : RESULT_RULES[r].label)}
            </button>
          ))}
        </div>
        {asksAmount && (
          <div className={s.field}>
            <label htmlFor={`amount-${contact.id}`}>{result === 'venta' ? 'Monto de la venta' : 'Monto de la cotización'}</label>
            <div className={s.money}>
              <span aria-hidden="true">$</span>
              <input id={`amount-${contact.id}`} inputMode="decimal" className={s.num} value={amount} placeholder="0"
                onChange={e => setAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') noteRef.current?.focus() }} />
            </div>
          </div>
        )}
      </div>

      <div className={s.step}>
        <div className={s.stepHead}><span className={s.stepN}>3</span>Nota y siguiente paso</div>
        <div className={s.field} style={{ marginTop: 0 }}>
          <textarea ref={noteRef} rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)}
            placeholder="¿Qué quedó?" aria-label="Nota" />
        </div>
        {needsDate && (
          <div className={s.field}>
            <label>Volver a contactar</label>
            <div className={s.suggest} role="group" aria-label="Cuándo volver a contactar">
              {choices.map(c => (
                <button key={c.value} type="button" className={s.press} aria-pressed={!picking && nextAt === c.value}
                  onClick={() => { setNextAt(c.value); setPicking(false) }}>{c.label}</button>
              ))}
              <button type="button" className={s.press} aria-pressed={picking} onClick={() => setPicking(true)}>Elegir fecha</button>
            </div>
            {picking && (
              <input type="date" min={today} value={nextAt} onChange={e => setNextAt(e.target.value)} aria-label="Fecha para volver a contactar" />
            )}
          </div>
        )}
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}
      <button type="button" className={`${s.save} ${s.press}`} onClick={save} disabled={saving}>
        {saving ? 'Guardando…' : nextName ? <>Guardar y seguir con el siguiente <Ico.next /></> : 'Guardar'}
      </button>
      <div className={s.saveSub} aria-live="polite">
        {result ? outcomeText(result) : 'Elige el resultado para ver qué pasa con este cliente'}
      </div>
    </div>
  )
}
