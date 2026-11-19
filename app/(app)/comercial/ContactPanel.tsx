'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiClient'
import { useSession } from '@/lib/profile'
import { useQueryEffect } from '@/lib/useCachedQuery'
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
import { ClientQuotesList, newQuoteHref, useClientQuotes } from '@/components/ClientQuotes'
import { FileText } from 'lucide-react'

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
export function ContactPanel({ contactId, initial, today, variant, readonly, waModule, storeName, uid, kind, result, onSaved, onClose }: {
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
  /** Se registró una actividad. */
  onSaved: (c: CommercialContact) => void
  onClose?: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [history, setHistory] = useState<Activity[] | null>(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  // «Correo» en la ficha deja el formulario listo para registrar el correo
  const [formKind, setFormKind] = useState<Kind | undefined>(kind)
  const isAdmin = !!useSession()?.isAdmin
  const contact = detail?.contact ?? initial ?? null
  const quotes = useClientQuotes(contactId)

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([
        apiFetch(`/api/data/commercial/contacts/${contactId}`).then(r => r.ok ? r.json() : Promise.reject(r)),
        apiFetch(`/api/data/commercial/activities?contact_id=${contactId}`).then(r => r.ok ? r.json() : { activities: [] }),
      ])
      setDetail(d); setHistory(h.activities ?? [])
    } catch {
      setError('No se pudo abrir este contacto')
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
          <Link href="/recordatorios">Ver en Agenda</Link>
          {!readonly && canClose && (
            <button type="button" className={`${s.nextClose} ${s.press}`} disabled={closing} onClick={closeFollowUp}>
              {closing ? 'Cerrando…' : 'Cerrar seguimiento'}
            </button>
          )}
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
          <Link href={newQuoteHref(contact.id)} className={`${s.act} ${s.actMore} ${s.press}`} aria-label="Hacer una cotización" title="Cotizar"><FileText size={16} aria-hidden="true" /></Link>
        )}
        <Link href={`/contactos?id=${contact.id}`} className={`${s.act} ${s.actMore} ${s.press}`} aria-label="Ver en Contactos" title="Ver en Contactos"><Ico.user /></Link>
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}

      {!readonly && (
        <div className={s.section}>
          {contact.owner_id && !mine && contact.owner_name && (
            <p className={s.notice}>Lo trabaja {contact.owner_name}. Si registras una actividad, pasa a ser tuyo.</p>
          )}
          <RegisterForm key={`${contact.id}-${formKind ?? ''}`} contact={contact} today={today} initialKind={formKind} initialResult={result}
            wide={variant === 'pane'} onSaved={c => { onSaved(c); load() }} />
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
          {!readonly && <Link href={newQuoteHref(contact.id)} className="link-btn">Cotizar</Link>}
        </div>
        <ClientQuotesList quotes={quotes} />
      </div>

      <div className={s.section}>
        <div className={s.sectionTitle}>Historial</div>
        {history === null ? <HistorySkeleton /> : history.length === 0 ? (
          <div className={s.hMuted}>Todavía no hay actividades con este cliente.</div>
        ) : (
          <div className={s.history}>
            {history.map(a => (
              <div key={a.id} className={s.hItem}>
                <span className={s.num}>{fmtDay(localDay(a.created_at))}</span>
                <div>
                  {quoteOf.get(a.id)
                    ? <Link href={`/cotizaciones/${quoteOf.get(a.id)}`} className={s.hLink}><b>{KIND_LABELS[a.kind] ?? a.kind}{a.result ? ` · ${resultLabel(a.result)}` : ''}</b></Link>
                    : <b>{KIND_LABELS[a.kind] ?? a.kind}{a.result ? ` · ${resultLabel(a.result)}` : ''}</b>}
                  {a.quote_amount ? ` · ${money(a.quote_amount)}` : ''}{a.sale_amount ? ` · vendió ${money(a.sale_amount)}` : ''}
                  {(a.user_name || a.note) && <div className={s.hMuted}>{[a.user_name, a.note && `«${a.note}»`].filter(Boolean).join(' · ')}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
