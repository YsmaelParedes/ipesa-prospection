'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { hasStreetNumber } from '@/lib/address'
import {
  ACTIVITY_KINDS, COMMERCIAL_STATUSES, KIND_LABELS, NO_ANSWER_LIMIT, RESULTS, RESULT_RULES, STATUS_INFO,
  resultLabel, suggestNext, type ActivityKind, type CallResult, type CommercialContact,
} from '@/lib/commercial'
import { fmtAgo } from '@/lib/datetime'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { Select } from '@/components/Select'
import { Ico, StatusChip, addressOf, bizName, coloniaOf, fmtDay, money, nextLabel, personName } from './ui'
import s from './comercial.module.css'

type Activity = {
  id: string; kind: ActivityKind; result: string | null; note: string | null
  quote_amount: number | null; sale_amount: number | null
  next_action: string | null; next_action_at: string | null; created_at: string; user_name: string | null
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export function CallPanel({ contact, today, canWork, readonly, waModule, onClose, onChanged, onNext, nextName }: {
  contact: CommercialContact
  today: string
  /** Es el responsable (o el dueño con un contacto sin asignar) y puede registrar. */
  canWork: boolean
  readonly: boolean
  waModule: boolean
  onClose: () => void
  onChanged: (c: CommercialContact) => void
  /** Pasa al siguiente de la cola (si hay). */
  onNext?: () => void
  nextName?: string
}) {
  const [kind, setKind]         = useState<ActivityKind>('llamada')
  const [result, setResult]     = useState<CallResult | null>(null)
  const [note, setNote]         = useState('')
  const [amount, setAmount]     = useState('')
  const [nextAt, setNextAt]     = useState('')
  const [nextAction, setNextAction] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [history, setHistory]   = useState<Activity[] | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const phone = normalizePhone(contact.phone)
  const editable = canWork && !readonly
  const rule = result ? RESULT_RULES[result] : null

  const loadHistory = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/data/commercial/activities?contact_id=${contact.id}`)
      const d = await r.json()
      setHistory(d.activities || [])
    } catch { setHistory([]) }
  }, [contact.id])
  useQueryEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const pickResult = (r: CallResult) => {
    setResult(r)
    const next = suggestNext(r, today)
    setNextAt(next.nextAt ?? '')
    setNextAction(next.nextAction ?? '')
    setAmount('')
    setTimeout(() => noteRef.current?.focus(), 30)
  }

  const reset = () => { setResult(null); setNote(''); setAmount(''); setNextAt(''); setNextAction(''); setError('') }

  const save = async (advance: boolean) => {
    if (kind !== 'nota' && !result) { setError('Elige el resultado'); return }
    if (kind === 'nota' && !note.trim()) { setError('Escribe la nota'); return }
    if (rule?.pickDate && !nextAt) { setError('Elige la fecha para volver a llamar'); return }
    const value = amount ? Number(amount) : null
    if (value !== null && (!Number.isFinite(value) || value < 0)) { setError('El monto no es válido'); return }
    setSaving(true); setError('')
    try {
      const r = await apiFetch('/api/data/commercial/activities', jsonInit('POST', {
        contact_id: contact.id, kind,
        result: kind === 'nota' ? null : result,
        note: note.trim() || null,
        quote_amount: rule?.askQuote ? value : null,
        sale_amount: rule?.askSale ? value : null,
        next_action: kind === 'nota' ? null : (nextAt ? (nextAction.trim() || 'Dar seguimiento') : null),
        next_action_at: kind === 'nota' ? null : (nextAt || null),
        status: kind === 'nota' ? null : rule?.status ?? null,
      }))
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar'); return }
      if (d.contact) onChanged(d.contact)
      reset()
      loadHistory()
      if (advance && onNext) onNext()
    } finally { setSaving(false) }
  }

  const patch = async (body: Record<string, unknown>) => {
    setError('')
    const r = await apiFetch(`/api/data/commercial/contacts/${contact.id}`, jsonInit('PATCH', body))
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'No se pudo actualizar'); return false }
    onChanged(d.contact)
    return true
  }

  const next = nextLabel(contact.next_action_at, today)
  const addr = addressOf(contact)
  const colonia = coloniaOf(contact)
  const person = personName(contact)

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail" aria-label={`Contacto ${bizName(contact)}`}>
        <div className="detail-head">
          <button className="detail-close" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
          <div className="detail-kicker">Sistema comercial{contact.owner_name ? ` · ${contact.owner_name}` : ''}</div>
          <div className="detail-title">{bizName(contact)}</div>
          <div className="detail-meta">
            <StatusChip value={contact.commercial_status} />
            {person && <span className="cell-muted">{person}</span>}
            <span className={`follow-chip ${next.tone}`}>{next.label}</span>
            <Link href={`/contactos?id=${contact.id}`} className="detail-link"><Ico.user /> Ver contacto</Link>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-section">
            <div className="kv-grid">
              <div className="kv"><div className="k">Teléfono</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPhone(contact.phone) || '—'}</div></div>
              <div className="kv"><div className="k">Colonia</div><div className="v">{colonia || '—'}</div></div>
              <div className="kv" style={{ gridColumn: '1 / -1' }}><div className="k">Dirección</div><div className="v" style={{ fontSize: 13 }}>{addr || '—'}{addr && !hasStreetNumber(contact.address) ? ' · sin número' : ''}</div></div>
              <div className="kv"><div className="k">Correo</div><div className="v" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{contact.email || '—'}</div></div>
              <div className="kv"><div className="k">Próxima acción</div><div className="v" style={{ fontSize: 13 }}>{contact.next_action_at ? `${contact.next_action || 'Dar seguimiento'} · ${fmtDay(contact.next_action_at)}` : '—'}</div></div>
            </div>
          </div>

          {contact.no_answer_streak >= NO_ANSWER_LIMIT && (
            <div className={`${s.notice} ${s.noticeWarn}`}>{contact.no_answer_streak} llamadas seguidas sin respuesta: queda al final de su grupo en la cola.</div>
          )}

          {readonly ? null : !canWork ? (
            <div className={s.notice}>Este contacto lo trabaja {contact.owner_name || 'otra persona del equipo'}. Puedes ver su historial; solo su responsable registra llamadas.</div>
          ) : (
            <div className="detail-section">
              <h4>Registrar</h4>
              <div className={s.kinds} role="group" aria-label="Tipo de actividad">
                {ACTIVITY_KINDS.map(k => (
                  <button key={k} type="button" className={s.kind} aria-pressed={kind === k} disabled={saving}
                    onClick={() => { setKind(k); if (k === 'nota') setResult(null); setError('') }}>{KIND_LABELS[k]}</button>
                ))}
              </div>

              {kind !== 'nota' && (
                <div className={s.results} role="group" aria-label="Resultado">
                  {RESULTS.map(r => {
                    const rr = RESULT_RULES[r]
                    const hint = rr.pickDate ? 'Tú eliges la fecha' : rr.days === null ? 'Sale de la cola' : rr.days === 1 ? 'Mañana' : `En ${rr.days} días`
                    return (
                      <button key={r} type="button" className={s.result} aria-pressed={result === r} disabled={saving} onClick={() => pickResult(r)}>
                        {rr.label}<small>{hint}</small>
                      </button>
                    )
                  })}
                </div>
              )}

              {(rule?.askQuote || rule?.askSale) && (
                <div className="field">
                  <label htmlFor="cm-amount">{rule.askQuote ? 'Monto cotizado (MXN)' : 'Monto vendido (MXN)'}</label>
                  <input id="cm-amount" type="number" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                </div>
              )}

              <div className="field">
                <label htmlFor="cm-note">Nota</label>
                <textarea id="cm-note" ref={noteRef} rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={2000}
                  placeholder={kind === 'nota' ? 'Qué pasó o qué hay que recordar' : 'Lo que dijo, lo que pidió…'} />
              </div>

              {kind !== 'nota' && result && (rule?.days !== null || rule?.pickDate) && (
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="cm-next-at">Próximo seguimiento</label>
                    <input id="cm-next-at" type="date" min={today} value={nextAt} onChange={e => setNextAt(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cm-next">Qué sigue</label>
                    <input id="cm-next" value={nextAction} onChange={e => setNextAction(e.target.value)} maxLength={200} />
                  </div>
                </div>
              )}
              {result === 'numero_equivocado' && <div className={s.notice}>Pasa a "Por depurar" para corregir el teléfono.</div>}

              {error && <div className="field-error" style={{ marginBottom: 8 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={`btn ${onNext ? 'btn-ghost' : 'btn-primary'}`} onClick={() => save(false)} disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                {onNext && (
                  <button className="btn btn-primary" onClick={() => save(true)} disabled={saving} style={{ flex: 1 }} title={nextName ? `Sigue: ${nextName}` : undefined}>
                    Guardar y siguiente <Ico.next />
                  </button>
                )}
              </div>
            </div>
          )}

          {editable && (
            <div className="detail-section">
              <h4>Estado y seguimiento</h4>
              <div className="field-row">
                <div className="field">
                  <label>Estado</label>
                  <Select value={contact.commercial_status} aria-label="Estado comercial"
                    onChange={v => patch({ commercial_status: v })}
                    options={COMMERCIAL_STATUSES.map(v => ({ value: v, label: STATUS_INFO[v].label, color: STATUS_INFO[v].color }))} />
                </div>
                <div className="field">
                  <label htmlFor="cm-resched">Reprogramar</label>
                  <input id="cm-resched" type="date" value={contact.next_action_at ?? ''}
                    onChange={e => patch({ next_action_at: e.target.value || null, ...(e.target.value && !contact.next_action ? { next_action: 'Dar seguimiento' } : {}) })} />
                </div>
              </div>
              {contact.commercial_status === 'depurar' && (
                <button className="btn btn-ghost btn-block" onClick={() => patch(contact.last_activity_at
                  ? { commercial_status: 'contactado', next_action_at: today, next_action: contact.next_action || 'Dar seguimiento' }
                  : { commercial_status: 'nuevo' })}>
                  Ya está corregido: volver a la cola
                </button>
              )}
            </div>
          )}

          <div className="detail-section">
            <h4>Historial</h4>
            {history === null ? null : history.length === 0 ? (
              <div className="empty-state small" style={{ textAlign: 'left', padding: 0 }}>Todavía no hay llamadas ni notas.</div>
            ) : (
              <div className={s.history}>
                {history.map(a => (
                  <div key={a.id} className={s.hItem}>
                    <div className={s.hHead}>
                      <strong>{KIND_LABELS[a.kind] ?? a.kind}{a.result ? ` · ${resultLabel(a.result)}` : ''}</strong>
                      <span>{fmtAgo(a.created_at)}</span>
                      {a.user_name && <span>· {a.user_name}</span>}
                      {a.quote_amount ? <span className={s.hMoney}>Cotizó {money(a.quote_amount)}</span> : null}
                      {a.sale_amount ? <span className={s.hMoney}>Vendió {money(a.sale_amount)}</span> : null}
                    </div>
                    {a.note && <div className={s.hNote}>{a.note}</div>}
                    {a.next_action_at && a.kind !== 'nota' && <div className={s.hHead} style={{ marginTop: 4 }}>Siguiente: {a.next_action || 'Dar seguimiento'} · {fmtDay(a.next_action_at)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="detail-foot">
          {contact.phone && <a href={`tel:${phone || contact.phone}`} className="btn btn-ghost btn-ghost-call"><Ico.phone /> Llamar</a>}
          {waModule && phone.length === 10 && (
            <Link href={`/whatsapp?phone=${phone}`} className="btn btn-ghost btn-ghost-whatsapp"><Ico.whatsapp /> WhatsApp</Link>
          )}
          {contact.email && <a href={`mailto:${contact.email}`} className="btn btn-ghost btn-ghost-mail"><Ico.mail /> Correo</a>}
        </div>
      </aside>
    </>
  )
}
