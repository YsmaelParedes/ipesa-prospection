'use client'

import { apiFetch } from '@/lib/apiClient'


import { useEffect, useState } from 'react'
import { APP_NAME } from '@/lib/brand'
import { isMoney } from '@/lib/payments'
import { fmtDate, type PlatformStore } from './data'
import s from './admin.module.css'

/**
 * Altas por invitación en el panel del dueño: "Nueva tienda" (crea la tienda
 * "Por activar" y el enlace para su dueño) y la invitación del dueño en la
 * ficha (generar un enlace nuevo mientras la tienda no tenga dueño).
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

async function postJson(url: string, body: unknown) {
  const r = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar')
  return d
}

/* ── Enlace de invitación: copiar o mandar por WhatsApp ─────────────────── */
export function InviteLinkBox({ link, storeName, phone, expiresAt }: { link: string; storeName: string; phone: string | null; expiresAt: string }) {
  const [copied, setCopied] = useState(false)
  const digits = (phone ?? '').replace(/\D/g, '')
  const to = digits.length === 10 ? `52${digits}` : ''
  const text = `Hola, ya está lista tu tienda ${storeName} en ${APP_NAME}. Entra con este enlace para crear tu contraseña (vence el ${fmtDate(expiresAt, { day: 'numeric', month: 'long' })}): ${link}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link) } catch { window.prompt('Copia el enlace:', link); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className={s.inviteBox}>
      <code className={s.inviteLink}>{link}</code>
      <small>Vence el {fmtDate(expiresAt)}. Solo se muestra ahora: si se pierde, genera uno nuevo desde la ficha.</small>
      <div className={s.inviteBtns}>
        <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? 'Copiado' : 'Copiar enlace'}</button>
        <a className="btn btn-ghost" href={`https://wa.me/${to}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
          Mandar por WhatsApp{to ? '' : '…'}
        </a>
      </div>
    </div>
  )
}

/* ── Nueva tienda ───────────────────────────────────────────────────────── */
type Created = { id: string; name: string; phone: string | null; link: string; expiresAt: string; ownerEmail: string }

export function NewStoreModal({ onClose, onCreated, onOpenStore }: {
  onClose: () => void; onCreated: () => Promise<void>; onOpenStore: (id: string) => void
}) {
  const [form, setForm] = useState({ name: '', city: '', state: '', phone: '', ownerEmail: '', monthlyPrice: '' })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: k === 'monthlyPrice' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const price = form.monthlyPrice.trim() === '' ? null : Number(form.monthlyPrice)
    if (form.name.trim().length < 3) { setError('Escribe el nombre de la tienda'); return }
    if (!EMAIL_RE.test(form.ownerEmail.trim())) { setError('Escribe el correo del dueño: ahí le llega su acceso'); return }
    if (price !== null && !isMoney(price)) { setError('Precio inválido (hasta 2 decimales)'); return }
    setBusy(true)
    setError('')
    try {
      const d = await postJson('/api/platform/stores', {
        name: form.name.trim(), city: form.city.trim() || null, state: form.state.trim() || null,
        phone: form.phone.trim() || null, ownerEmail: form.ownerEmail.trim(), monthlyPrice: price,
      })
      setCreated({ id: d.store.id, name: d.store.name, phone: form.phone.trim() || null, link: d.link, expiresAt: d.invitation.expiresAt, ownerEmail: d.invitation.email })
      await onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" onClick={() => !busy && onClose()}>
      <div className={cx('modal-card', s.drawer)} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ns-title">
        <div className="modal-head">
          <h3 id="ns-title">{created ? `${created.name} creada` : 'Nueva tienda'}</h3>
          <button className="btn-icon modal-close" onClick={onClose} aria-label="Cerrar" disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {created ? (
          <>
            <div className="modal-body">
              <div className={cx(s.msg, s.msgOk)} style={{ marginTop: 0 }}>
                La tienda está <strong>Por activar</strong>: su dueño puede entrar y configurarla, pero no registrar clientes hasta que registres su primer pago o una cortesía.
              </div>
              <div className={s.block} style={{ marginTop: 14 }}>
                <div className={s.blockHead}><strong>Invitación para el dueño</strong><small>{created.ownerEmail}</small></div>
                <InviteLinkBox link={created.link} storeName={created.name} phone={created.phone} expiresAt={created.expiresAt} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
              <button className="btn btn-primary" onClick={() => onOpenStore(created.id)}>Registrar primer pago</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-body">
              <div className={s.formSection}>La tienda</div>
              <div className="field">
                <label htmlFor="ns-name">Nombre</label>
                <input id="ns-name" value={form.name} onChange={set('name')} maxLength={80} placeholder="Pinturas del Valle" autoFocus />
              </div>
              <div className={s.formGrid}>
                <div className="field"><label htmlFor="ns-city">Ciudad</label><input id="ns-city" value={form.city} onChange={set('city')} maxLength={80} placeholder="Puebla" /></div>
                <div className="field"><label htmlFor="ns-state">Estado</label><input id="ns-state" value={form.state} onChange={set('state')} maxLength={80} placeholder="Puebla" /></div>
              </div>
              <div className="field">
                <label htmlFor="ns-phone">Teléfono de la tienda (opcional)</label>
                <input id="ns-phone" value={form.phone} onChange={set('phone')} maxLength={20} inputMode="tel" placeholder="222 123 4567" />
              </div>
              <div className={s.formSection}>El dueño</div>
              <div className="field">
                <label htmlFor="ns-owner">Correo del dueño</label>
                <input id="ns-owner" type="email" value={form.ownerEmail} onChange={set('ownerEmail')} maxLength={254} placeholder="dueno@correo.com" autoComplete="off" />
              </div>
              <div className={s.formSection}>Acuerdo</div>
              <div className="field">
                <label htmlFor="ns-price">Precio mensual acordado (MXN, opcional)</label>
                <input id="ns-price" value={form.monthlyPrice} onChange={set('monthlyPrice')} inputMode="decimal" placeholder="Sin acordar" />
              </div>
              {error && <div className={cx(s.msg, s.msgErr)} role="alert">{error}</div>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear tienda e invitación'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* ── Invitación del dueño (ficha de una tienda sin dueño) ───────────────── */
export function OwnerInviteBlock({ store, onDone }: { store: PlatformStore; onDone: () => Promise<void> }) {
  const invite = store.owner_invite
  const [email, setEmail] = useState(invite?.email ?? '')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState<{ link: string; expiresAt: string } | null>(null)

  const generate = async () => {
    if (!EMAIL_RE.test(email.trim())) { setError('Escribe el correo del dueño'); return }
    setBusy(true)
    setError('')
    try {
      const d = await postJson(`/api/platform/stores/${store.id}/invitation`, { email: email.trim() })
      setFresh({ link: d.link, expiresAt: d.invitation.expiresAt })
      await onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const state = !invite ? 'Sin invitación vigente'
    : invite.status === 'expired' ? `La invitación a ${invite.email} venció el ${fmtDate(invite.expires_at)}`
    : `Invitación enviada a ${invite.email} · vence el ${fmtDate(invite.expires_at)}`

  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <strong>Dueño de la tienda</strong>
        <small>Aún no ha entrado</small>
      </div>
      <p className={s.blockText}>{state}. Si el enlace se perdió o venció, genera uno nuevo (el anterior deja de servir).</p>
      {fresh ? (
        <InviteLinkBox link={fresh.link} storeName={store.name} phone={store.phone} expiresAt={fresh.expiresAt} />
      ) : (
        <div className={s.inviteRow}>
          <input className={s.input} style={{ flex: 1, width: 'auto' }} type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="dueno@correo.com" aria-label="Correo del dueño" maxLength={254} />
          <button type="button" className="btn btn-ghost" onClick={generate} disabled={busy}>{busy ? 'Generando…' : 'Generar enlace nuevo'}</button>
        </div>
      )}
      {error && <div className={cx(s.msg, s.msgErr)} role="alert">{error}</div>}
    </div>
  )
}
