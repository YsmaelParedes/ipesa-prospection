'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import {
  KIND_LABELS, NO_ANSWER_LIMIT, STAGE_PROBABILITY, resultLabel,
  type ActivityKind, type CommercialContact, type ResultChoice,
} from '@/lib/commercial'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { Select } from '@/components/Select'
import { RegisterForm, type Kind } from './RegisterForm'
import { Ico, StatusChip, addressOf, bizName, fmtDay, initials, money, personName, type ListContact, type Member } from './ui'
import s from './comercial.module.css'

type Activity = {
  id: string; kind: ActivityKind; result: string | null; note: string | null
  quote_amount: number | null; sale_amount: number | null
  next_action_at: string | null; created_at: string; user_name: string | null
}
type Detail = { contact: ListContact; canWork: boolean; team: Member[]; today: string }

const AVATAR: Record<string, [string, string]> = {
  nuevo: ['var(--c-cyan-soft)', 'var(--c-cyan-ink)'], contactado: ['var(--c-teal-soft)', 'var(--c-teal-ink)'],
  interes: ['var(--c-teal-soft)', 'var(--c-teal-ink)'], cotizacion: ['var(--warning-soft)', 'var(--warning)'],
  cliente: ['var(--success-soft)', 'var(--success)'], depurar: ['var(--danger-soft)', 'var(--danger)'],
}
export const avatarColors = (status: string) => AVATAR[status] ?? ['var(--paper-2)', 'var(--ink-3)']

/**
 * Ficha comercial de un contacto. En computadora va a la derecha de la lista
 * ("pane"); en celular, o desde Oportunidades y Equipo, se abre encima ("overlay").
 */
export function ContactPanel({ contactId, initial, today, variant, isAdmin, readonly, waModule, kind, result, nextName, onSaved, onChanged, onClose }: {
  contactId: string
  initial?: ListContact
  today: string
  variant: 'pane' | 'overlay'
  isAdmin: boolean
  readonly: boolean
  waModule: boolean
  kind?: Kind
  result?: ResultChoice
  nextName?: string
  /** Se registró una actividad. */
  onSaved: (c: CommercialContact) => void
  /** Otro cambio (reasignar): actualiza la lista sin pasar al siguiente. */
  onChanged?: (c: CommercialContact) => void
  onClose?: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [history, setHistory] = useState<Activity[] | null>(null)
  const [error, setError] = useState('')
  const contact = detail?.contact ?? initial ?? null

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

  async function reassign(owner: string) {
    const r = await apiFetch(`/api/data/commercial/contacts/${contactId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_id: owner || null }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'No se pudo reasignar'); return }
    ;(onChanged ?? onSaved)(d.contact)
    load()
  }

  if (!contact) {
    const body = <div className="empty-state small">{error || 'Cargando…'}</div>
    return variant === 'pane' ? <aside className={`${s.elev} ${s.pane}`}>{body}</aside> : <Overlay onClose={onClose}>{body}</Overlay>
  }

  const phone = normalizePhone(contact.phone)
  // Mientras carga la ficha no se sabe si es suyo: no se muestra ni el registro ni el aviso
  const canWork = !!detail?.canWork
  const prob = STAGE_PROBABILITY[contact.commercial_status]
  const [bg, fg] = avatarColors(contact.commercial_status)
  const person = personName(contact)
  const addr = addressOf(contact)
  const ownerLabel = !contact.owner_id ? 'Sin asignar' : !detail ? null : canWork ? 'Tuyo' : `De ${contact.owner_name || 'otra persona'}`

  const content = (
    <>
      <div className={s.paneHead}>
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

      <div className={s.actions}>
        {phone && <a href={`tel:${phone}`} className={`${s.act} ${s.actCall} ${s.press}`}><Ico.phone /> Llamar</a>}
        {waModule && phone.length === 10 && contact.line_type !== 'fijo' && (
          <Link href={`/whatsapp?phone=${phone}`} className={`${s.act} ${s.actWa} ${s.press}`}><Ico.chat /> WhatsApp</Link>
        )}
        <Link href={`/contactos?id=${contact.id}`} className={`${s.act} ${s.actMore} ${s.press}`} aria-label="Ver en Contactos" title="Ver en Contactos"><Ico.user /></Link>
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}

      {readonly ? null : !detail ? (
        <p className={s.notice}>Cargando…</p>
      ) : !canWork ? (
        <p className={s.notice}>Este cliente lo trabaja {contact.owner_name || 'otra persona del equipo'}. Puedes ver su historial; solo su responsable registra actividades.</p>
      ) : (
        <div className={s.section}>
          <RegisterForm key={contact.id} contact={contact} today={today} initialKind={kind} initialResult={result}
            wide={variant === 'pane'} nextName={nextName}
            onSaved={c => { onSaved(c); load() }} />
        </div>
      )}

      {isAdmin && !readonly && detail && detail.team.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Responsable</div>
          <Select value={contact.owner_id ?? ''} aria-label="Responsable" onChange={reassign}
            options={[{ value: '', label: 'Sin asignar' }, ...detail.team.map(m => ({ value: m.user_id, label: m.name }))]} />
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
        <div className={s.sectionTitle}>Historial</div>
        {history === null ? <div className={s.hMuted}>Cargando…</div> : history.length === 0 ? (
          <div className={s.hMuted}>Todavía no hay actividades con este cliente.</div>
        ) : (
          <div className={s.history}>
            {history.map(a => (
              <div key={a.id} className={s.hItem}>
                <span className={s.num}>{fmtDay(a.created_at.slice(0, 10))}</span>
                <div>
                  <b>{KIND_LABELS[a.kind] ?? a.kind}{a.result ? ` · ${resultLabel(a.result)}` : ''}</b>
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
