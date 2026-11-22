'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { notifyDataChanged } from '@/lib/crmEvents'
import type { CommercialEvent } from '@/lib/commercialChanges'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FollowupDateDialog } from '@/components/FollowupDateDialog'
import {
  KIND_LABELS, NO_ANSWER_LIMIT, STAGE_PROBABILITY, resultLabel,
  type ActivityKind, type CommercialContact, type ResultChoice,
} from '@/lib/commercial'
import { fmtPhone, normalizePhone, waMeLink } from '@/lib/phone'
import { RegisterForm, type Kind } from './RegisterForm'
import { EmailButton } from './EmailButton'
import { Ico, StatusChip, addressOf, bizName, fmtDay, initials, localDay, money, personName, whenPhrase, type ListContact } from './ui'
import s from './comercial.module.css'
import { ContactPaneSkeleton, HistorySkeleton } from './Skeletons'
import { ClientQuotesList, useClientQuotes } from '@/components/ClientQuotes'
import { QuoteStartDialog } from '@/components/QuoteStartDialog'
import { FileText, PencilLine, Trash2 } from 'lucide-react'

type Activity = {
  id: string; kind: ActivityKind; result: string | null; note: string | null
  quote_amount: number | null; sale_amount: number | null
  next_action_at: string | null; created_at: string; user_name: string | null
}
type Detail = { contact: ListContact; today: string }

const AVATAR: Record<string, [string, string]> = {
  nuevo: ['var(--c-cyan-soft)', 'var(--c-cyan-ink)'], contactado: ['var(--c-teal-soft)', 'var(--c-teal-ink)'],
  interes: ['var(--c-teal-soft)', 'var(--c-teal-ink)'], cotizacion: ['var(--warning-soft)', 'var(--warning)'],
  cliente: ['var(--success-soft)', 'var(--success)'], depurar: ['var(--danger-soft)', 'var(--danger)'],
}
export const avatarColors = (status: string) => AVATAR[status] ?? ['var(--paper-2)', 'var(--ink-3)']

/**
 * Ficha comercial de un contacto. En computadora va a la derecha de la lista
 * ("pane"); en celular, o desde Cartera y Oportunidades, se abre encima ("overlay").
 * Cualquiera del equipo registra; quien registra se queda con el contacto.
 */
export function ContactPanel({ contactId, initial, today, variant, readonly, waModule, storeName, uid, kind, result, amount, onSaved, onClose }: {
  contactId: string
  initial?: ListContact
  today: string
  variant: 'pane' | 'overlay'
  readonly: boolean
  waModule: boolean
  /** Va en el asunto de los correos. */
  storeName?: string
  /** Quien está usando la app (para "Tuyo"). */
  uid?: string
  kind?: Kind
  result?: ResultChoice
  /** Monto con el que se abre el registro (venta de una cotización ganada). */
  amount?: number
  /** Cambió el contacto; what dice qué pasó si no fue registrar una actividad (para el aviso). */
  onSaved: (c: CommercialContact, what?: string) => void
  onClose?: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [history, setHistory] = useState<Activity[] | null>(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const [events, setEvents] = useState<CommercialEvent[]>([])
  // «Correo» en la ficha deja el formulario listo para registrar el correo
  const [formKind, setFormKind] = useState<Kind | undefined>(kind)
  // Cerrar el seguimiento de una cotización pregunta cómo terminó y abre el registro así
  const [formResult, setFormResult] = useState<ResultChoice | undefined>(result)
  const [formAmount, setFormAmount] = useState<number | undefined>(amount)
  const [dateOpen, setDateOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [closeAsk, setCloseAsk] = useState(false)
  const [closeChoice, setCloseChoice] = useState<'venta' | 'perdida' | 'abierta'>('venta')
  // Correcciones del administrador: monto de una actividad o borrar la última
  const [fixing, setFixing] = useState<Activity | null>(null)
  const [fixValue, setFixValue] = useState('')
  const [removing, setRemoving] = useState<Activity | null>(null)
  const [busy, setBusy] = useState(false)
  const [dlgError, setDlgError] = useState('')
  const formRef = useRef<HTMLDivElement>(null)
  const isAdmin = !!useSession()?.isAdmin
  const contact = detail?.contact ?? initial ?? null
  const quotes = useClientQuotes(contactId)

  const load = useCallback(async (): Promise<Detail | null> => {
    try {
      const [d, h] = await Promise.all([
        apiFetch(`/api/data/commercial/contacts/${contactId}`).then(r => r.ok ? r.json() : Promise.reject(r)),
        apiFetch(`/api/data/commercial/activities?contact_id=${contactId}`).then(r => r.ok ? r.json() : { activities: [] }),
      ])
      setDetail(d); setHistory(h.activities ?? []); setEvents(h.events ?? [])
      return d
    } catch {
      setError('No se pudo abrir este contacto')
      return null
    }
  }, [contactId])
  useQueryEffect(() => { setDetail(null); setHistory(null); setError(''); load() }, [load])

  useEffect(() => {
    if (variant !== 'overlay' || !onClose) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [variant, onClose])

  async function closeFollowUp() {
    // Una cotización abierta no se cierra sin decir cómo terminó (si no, se queda en Oportunidades)
    if (contact?.commercial_status === 'cotizacion') { setCloseChoice('venta'); setCloseAsk(true); return }
    setClosing(true); setError('')
    try {
      const r = await apiFetch('/api/data/commercial/close-followup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact_id: contactId }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.contact) { setError(d.error || 'No se pudo cerrar el seguimiento'); return }
      onSaved(d.contact)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setClosing(false)
    }
  }

  function chooseClose() {
    setCloseAsk(false)
    if (closeChoice === 'abierta') { setDateOpen(true); return }
    const lastQuote = history?.find(a => a.quote_amount)?.quote_amount
    setFormResult(closeChoice === 'venta' ? 'venta' : 'no_interesado')
    setFormAmount(closeChoice === 'venta' && lastQuote ? Number(lastQuote) : undefined)
    setTimeout(() => formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
  }

  async function fixAmount() {
    if (!fixing) return
    const value = Number(fixValue.replace(/[,$\s]/g, ''))
    if (!Number.isFinite(value) || value <= 0) { setDlgError('Escribe un monto válido'); return }
    setBusy(true); setDlgError('')
    try {
      const r = await apiFetch(`/api/data/commercial/activities/${fixing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: value }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setDlgError(d.error || 'No se pudo corregir el monto'); return }
      setFixing(null)
      notifyDataChanged('commercial')
      load()
    } catch {
      setDlgError('Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function removeActivity() {
    if (!removing) return
    setBusy(true); setDlgError('')
    try {
      const r = await apiFetch(`/api/data/commercial/activities/${removing.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.contact) { setDlgError(d.error || 'No se pudo borrar la actividad'); return }
      setRemoving(null)
      notifyDataChanged('commercial')
      onSaved(d.contact, 'actividad borrada')
      load()
    } catch {
      setDlgError('Sin conexión. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (!contact) {
    const body = error ? <div className="empty-state small">{error}</div> : <ContactPaneSkeleton />
    return variant === 'pane' ? <aside className={`${s.elev} ${s.pane}`}>{body}</aside> : <Overlay onClose={onClose}>{body}</Overlay>
  }

  const phone = normalizePhone(contact.phone)
  const prob = STAGE_PROBABILITY[contact.commercial_status]
  const [bg, fg] = avatarColors(contact.commercial_status)
  const person = personName(contact)
  const addr = addressOf(contact)
  const mine = !!uid && contact.owner_id === uid
  const ownerLabel = !contact.owner_id ? 'Sin asignar' : mine ? 'Tuyo' : contact.owner_name ? `De ${contact.owner_name}` : null
  // Cerrar el seguimiento: su responsable o un administrador (el servidor también lo revisa)
  const canClose = isAdmin || !contact.owner_id || mine
  // Actividades y cambios (fecha, montos, borrados) juntos, lo más nuevo arriba
  const lines = [
    ...(history ?? []).map(a => ({ at: a.created_at, act: a as Activity | undefined, ev: undefined as CommercialEvent | undefined })),
    ...events.map(e => ({ at: e.created_at, act: undefined as Activity | undefined, ev: e as CommercialEvent | undefined })),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
  const latestId = history?.[0]?.id
  const actLabel = (a: Activity) => `${KIND_LABELS[a.kind] ?? a.kind}${a.result ? ` · ${resultLabel(a.result)}` : ''}`
  // «Cotización enviada» del historial lleva a su cotización
  const quoteOf = new Map((quotes ?? []).filter(q => q.activity_id).map(q => [q.activity_id as string, q.id]))

  const content = (
    <>
      <div className={s.paneHead} data-tour="ficha-head">
        <div className={s.avatar} style={{ background: bg, color: fg }} aria-hidden="true">{initials(bizName(contact))}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className={s.paneTitle}>{bizName(contact)}</h2>
          <p className={s.paneSub}>
            {[person, contact.segment, contact.zone, fmtPhone(contact.phone)].filter(Boolean).join(' · ')}
          </p>
          <div className={s.tags}>
            <StatusChip value={contact.commercial_status} />
            {prob && contact.commercial_status !== 'cliente' && <span className={s.tag}>{Math.round(prob * 100)} %</span>}
            {ownerLabel && <span className={s.tag}>{ownerLabel}</span>}
            {contact.phone && contact.line_type === 'fijo' && <span className={s.tag}>Fijo</span>}
            {contact.phone && contact.line_type === 'whatsapp' && <span className={s.tag}>Tiene WhatsApp</span>}
            {contact.no_answer_streak >= NO_ANSWER_LIMIT && <span className={`${s.tag} ${s.tagWarn}`}>No contesta · {contact.no_answer_streak}</span>}
          </div>
        </div>
        {variant === 'overlay' && onClose && (
          <button className="detail-close" style={{ position: 'static' }} onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
        )}
      </div>

      {contact.next_action_at && contact.commercial_status !== 'depurar' && (
        <div className={s.nextBox}>
          <span>Próximo seguimiento: <b>{contact.next_action || 'Dar seguimiento'}</b> · {whenPhrase(contact.next_action_at, today)}</span>
          {/* Juntas: en celular bajan al renglón de abajo sin partirse */}
          <span className={s.nextActs}>
            <Link href="/recordatorios" className={s.nextAgenda}>Ver en Agenda</Link>
            {!readonly && canClose && (
              <>
                <button type="button" className={`${s.nextClose} ${s.press}`} onClick={() => setDateOpen(true)}>Cambiar fecha</button>
                <button type="button" className={`${s.nextClose} ${s.press}`} disabled={closing} onClick={closeFollowUp}>
                  {closing ? 'Cerrando…' : 'Cerrar seguimiento'}
                </button>
              </>
            )}
          </span>
        </div>
      )}
      {!contact.next_action_at && contact.commercial_status !== 'depurar' && !readonly && canClose && contact.last_activity_at && (
        <div className={s.nextBox}>
          <span>Sin próximo seguimiento{contact.commercial_status === 'cotizacion' ? ': su cotización sigue abierta' : ''}</span>
          <button type="button" className={`${s.nextClose} ${s.press}`} style={{ marginLeft: 'auto' }} onClick={() => setDateOpen(true)}>Poner fecha</button>
        </div>
      )}

      {contact.commercial_status === 'depurar' && !readonly && (
        <FixPhone contact={contact} onFixed={c => { onSaved(c); load() }} />
      )}

      <div className={s.actions}>
        {phone && <a href={`tel:${phone}`} className={`${s.act} ${s.actCall} ${s.press}`}><Ico.phone /> Llamar</a>}
        {waModule && phone.length === 10 && contact.line_type !== 'fijo' && (
          <a href={waMeLink(phone)} target="_blank" rel="noopener noreferrer" className={`${s.act} ${s.actWa} ${s.press}`}><Ico.chat /> WhatsApp</a>
        )}
        <EmailButton email={contact.email} store={storeName} client={bizName(contact)}
          className={`${s.act} ${s.actMail} ${s.press}`} onOpen={() => { if (!readonly) setFormKind('correo') }}>
          <Ico.mail /> Correo
        </EmailButton>
        {!readonly && (
          <button type="button" onClick={() => setQuoteOpen(true)} className={`${s.act} ${s.actMore} ${s.press}`} aria-label="Cotizar" title="Cotizar"><FileText size={16} aria-hidden="true" /></button>
        )}
        <Link href={`/contactos?id=${contact.id}`} className={`${s.act} ${s.actMore} ${s.press}`} aria-label="Ver en Contactos" title="Ver en Contactos"><Ico.user /></Link>
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}

      {!readonly && (
        <div className={s.section} ref={formRef}>
          {contact.owner_id && !mine && contact.owner_name && (
            <p className={s.notice}>Lo trabaja {contact.owner_name}. Si registras una actividad, pasa a ser tuyo.</p>
          )}
          <RegisterForm key={`${contact.id}-${formKind ?? ''}-${formResult ?? ''}`} contact={contact} today={today} initialKind={formKind}
            initialResult={formResult} initialAmount={formAmount}
            wide={variant === 'pane'} onSaved={(c, what) => { onSaved(c, what); load() }} />
        </div>
      )}

      {(addr || contact.email) && (
        <div className={s.section}>
          <dl className={s.kv}>
            {addr && <><dt>Dirección</dt><dd>{addr}</dd></>}
            {contact.email && <><dt>Correo</dt><dd>{contact.email}</dd></>}
          </dl>
        </div>
      )}

      <div className={s.section}>
        <div className={s.sectionHead}>
          <div className={s.sectionTitle}>Cotizaciones</div>
          {!readonly && <button type="button" onClick={() => setQuoteOpen(true)} className="link-btn">Cotizar</button>}
        </div>
        <ClientQuotesList quotes={quotes} />
      </div>
      {quoteOpen && (
        <QuoteStartDialog client={{ id: contact.id, name: bizName(contact) }} onClose={() => setQuoteOpen(false)}
          onUploaded={async () => { const d = await load(); if (d?.contact) onSaved(d.contact, 'cotización subida') }} />
      )}

      <div className={s.section}>
        <div className={s.sectionTitle}>Historial</div>
        {history === null ? <HistorySkeleton /> : lines.length === 0 ? (
          <div className={s.hMuted}>Todavía no hay actividades con este cliente.</div>
        ) : (
          <div className={s.history}>
            {lines.map(({ act: a, ev }) => ev ? (
              <div key={`e-${ev.id}`} className={s.hItem}>
                <span className={s.num}>{fmtDay(localDay(ev.created_at))}</span>
                <div className={s.hMuted}>{ev.detail}{ev.user_name ? ` · ${ev.user_name}` : ''}</div>
              </div>
            ) : a ? (
              <div key={a.id} className={s.hItem}>
                <span className={s.num}>{fmtDay(localDay(a.created_at))}</span>
                <div>
                  {quoteOf.get(a.id)
                    ? <Link href={`/cotizaciones/${quoteOf.get(a.id)}`} className={s.hLink}><b>{actLabel(a)}</b></Link>
                    : <b>{actLabel(a)}</b>}
                  {a.quote_amount ? ` · ${money(a.quote_amount)}` : ''}{a.sale_amount ? ` · vendió ${money(a.sale_amount)}` : ''}
                  {(a.user_name || a.note) && <div className={s.hMuted}>{[a.user_name, a.note && `«${a.note}»`].filter(Boolean).join(' · ')}</div>}
                  {isAdmin && !readonly && (a.quote_amount || a.sale_amount || a.id === latestId) && (
                    <div className={s.hActs}>
                      {(a.quote_amount || a.sale_amount) && (
                        <button type="button" className={`${s.nextClose} ${s.press}`}
                          onClick={() => { setFixing(a); setFixValue(String(a.sale_amount ?? a.quote_amount)); setDlgError('') }}>Corregir monto</button>
                      )}
                      {a.id === latestId && (
                        <button type="button" className={`${s.nextClose} ${s.press}`} onClick={() => { setRemoving(a); setDlgError('') }}>Borrar</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null)}
          </div>
        )}
      </div>

      {!readonly && (
        <>
          <FollowupDateDialog open={dateOpen} contact={{ id: contact.id, name: bizName(contact), next_action: contact.next_action, next_action_at: contact.next_action_at }}
            today={today} onClose={() => setDateOpen(false)} onSaved={c => { onSaved(c, 'fecha cambiada'); load() }} />
          <ConfirmDialog open={closeAsk} tone="warn" title="¿Cómo terminó la cotización?" confirmLabel="Continuar"
            onConfirm={chooseClose} onCancel={() => setCloseAsk(false)}
            field={
              <div className={s.closePick} role="radiogroup" aria-label="Cómo terminó">
                {([['venta', 'Se vendió', 'Registra la venta'], ['perdida', 'No se vendió', 'Queda como no interesado'], ['abierta', 'Sigue abierta', 'Cambia la fecha del seguimiento']] as const).map(([k, label, sub]) => (
                  <button key={k} type="button" role="radio" aria-checked={closeChoice === k} onClick={() => setCloseChoice(k)}>
                    <b>{label}</b><small>{sub}</small>
                  </button>
                ))}
              </div>
            }>
            <p>{bizName(contact)} está en Oportunidades. Para sacarla de ahí, di cómo terminó.</p>
          </ConfirmDialog>
          <ConfirmDialog open={!!fixing} tone="warn" icon={PencilLine} title="Corregir el monto"
            confirmLabel="Corregir" busyLabel="Guardando…" busy={busy} error={dlgError} focusField
            onConfirm={fixAmount} onCancel={() => { if (!busy) setFixing(null) }}
            field={<>
              <label htmlFor="fix-amount">Monto correcto</label>
              <input id="fix-amount" inputMode="decimal" value={fixValue} onChange={e => setFixValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fixAmount() }} />
            </>}>
            {fixing && <p>{actLabel(fixing)} del {fmtDay(localDay(fixing.created_at))}: {money(fixing.sale_amount ?? fixing.quote_amount)}. Queda anotado en el historial.</p>}
          </ConfirmDialog>
          <ConfirmDialog open={!!removing} tone="danger" icon={Trash2} title="¿Borrar esta actividad?"
            confirmLabel="Borrar" busyLabel="Borrando…" busy={busy} error={dlgError}
            onConfirm={removeActivity} onCancel={() => { if (!busy) setRemoving(null) }}>
            {removing && <p>«{actLabel(removing)}» del {fmtDay(localDay(removing.created_at))}. {bizName(contact)} vuelve a como estaba antes de registrarla. Queda anotado en el historial.</p>}
          </ConfirmDialog>
        </>
      )}
    </>
  )

  return variant === 'pane'
    ? <aside className={`${s.elev} ${s.pane}`} aria-label={`Cliente ${bizName(contact)}`}>{content}</aside>
    : <Overlay onClose={onClose} label={`Cliente ${bizName(contact)}`}>{content}</Overlay>
}

/**
 * «Número incorrecto»: se corrige aquí mismo. Al guardar, el servidor lo saca
 * de ese estado y lo deja para llamarle hoy (ver PUT /api/data/contacts/[id]).
 */
function FixPhone({ contact, onFixed }: { contact: ListContact; onFixed: (c: CommercialContact) => void }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ready = value.length === 10 && value !== normalizePhone(contact.phone)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setSaving(true); setError('')
    try {
      const r = await apiFetch(`/api/data/contacts/${contact.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: value }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar el teléfono'); return }
      const updated = Array.isArray(d) ? d[0] : d
      onFixed({ ...contact, ...updated, no_answer_streak: 0 } as CommercialContact)
    } catch {
      setError('Sin conexión. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={s.fixBox} onSubmit={save}>
      <p><b>Número incorrecto.</b> Escribe el teléfono correcto y vuelve a tu lista de hoy.</p>
      <div className={s.fixRow}>
        <input inputMode="numeric" maxLength={10} value={value} placeholder="10 dígitos" aria-label="Teléfono correcto"
          onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 10))} />
        <button type="submit" className="btn btn-primary" disabled={!ready || saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
    </form>
  )
}

function Overlay({ children, onClose, label }: { children: React.ReactNode; onClose?: () => void; label?: string }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail" role="dialog" aria-modal="true" aria-label={label}>
        <div className="detail-body" style={{ overscrollBehavior: 'contain' }}>{children}</div>
      </aside>
    </>
  )
}
