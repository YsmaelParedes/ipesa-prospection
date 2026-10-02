'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_NAME } from '@/lib/brand'
import type { ClientStore } from '@/lib/profile'
import { ROLE_LABELS, type StoreRole } from '@/lib/stores'
import { Ico, Note, Panel, Spinner, WhatsAppGlyph, api, avatarTone, copyText, cx, fmtDate, initialsOf, send, useToast } from './ui'
import s from './configuracion.module.css'

type Member = {
  user_id: string; email: string; display_name: string; role: StoreRole; status: 'active' | 'disabled' | string
  joined_at: string; last_sign_in_at: string | null; isMe: boolean; canManage: boolean
}
type Invitation = { id: string; email: string; role: 'admin' | 'employee'; expiresAt: string; status: 'valid' | 'expired' | 'used' | 'revoked' }
type NewLink = { email: string; link: string }

const ROLE_BADGE: Record<StoreRole, string> = { owner: s.bBrand, admin: s.bTrial, employee: s.bMuted }

function lastSeen(iso: string | null) {
  if (!iso) return 'Aún no entra'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Activo hoy'
  if (days === 1) return 'Activo ayer'
  if (days < 30) return `Activo hace ${days} días`
  return `Último acceso: ${fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function TeamTab({ store, isOwner }: { store: ClientStore; isOwner: boolean }) {
  const [toast, showToast] = useToast()
  const [members, setMembers]   = useState<Member[] | null>(null)
  const [invites, setInvites]   = useState<Invitation[]>([])
  const [loadError, setLoadErr] = useState('')
  const [email, setEmail]       = useState('')
  const [role, setRole]         = useState<'employee' | 'admin'>('employee')
  const [inviting, setInviting] = useState(false)
  const [error, setError]       = useState('')
  const [newLink, setNewLink]   = useState<NewLink | null>(null)
  const [busyId, setBusyId]     = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const linkRef = useRef<HTMLDivElement>(null)

  // Un enlace nuevo (también desde "Invitaciones pendientes") siempre queda a la vista
  useEffect(() => {
    if (newLink) linkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [newLink])

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([
        api<{ members: Member[] }>('/api/store/members'),
        api<{ invitations: Invitation[] }>('/api/store/invitations'),
      ])
      setMembers(m.members)
      setInvites(i.invitations)
    } catch (err) {
      setLoadErr((err as Error).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const createInvite = async (target: string, targetRole: 'employee' | 'admin') => {
    const data = await api<{ link: string; invitation: { email: string } }>('/api/store/invitations', send('POST', { email: target, role: targetRole }))
    setNewLink({ email: data.invitation.email, link: data.link })
    await load()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInviting(true)
    try {
      await createInvite(email.trim(), role)
      setEmail('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInviting(false)
    }
  }

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusyId(id)
    setError('')
    try {
      await fn()
      showToast(done)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  const copy = async () => {
    if (newLink && await copyText(newLink.link)) showToast('Enlace copiado')
  }
  const waShare = (link: string) => `https://wa.me/?text=${encodeURIComponent(
    `Hola, te invito a unirte al equipo de ${store.name} en ${APP_NAME}. Crea tu acceso aquí: ${link}`,
  )}`

  const pending = invites.filter(i => i.status === 'valid' || i.status === 'expired')
  const activeSeats = (members?.filter(m => m.status === 'active').length ?? 0) + invites.filter(i => i.status === 'valid').length
  const seatPct = Math.min(100, (activeSeats / store.maxUsers) * 100)

  if (loadError) return <Note kind="danger">{loadError}</Note>

  return (
    <>
      <Panel icon={Ico.userPlus} title="Invitar a alguien" subtitle="Genera un enlace personal y compártelo por WhatsApp o correo. Vence en 7 días y solo sirve para ese correo.">
        <form className={s.inviteForm} onSubmit={submit}>
          <input className={s.input} type="email" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setError('') }}
            placeholder="correo@ejemplo.com" aria-label="Correo de la persona" autoComplete="off" />
          <div className={s.seg} role="radiogroup" aria-label="Rol">
            <button type="button" role="radio" aria-checked={role === 'employee'} className={cx(role === 'employee' && s.segOn)} onClick={() => setRole('employee')}>Vendedor</button>
            {isOwner && <button type="button" role="radio" aria-checked={role === 'admin'} className={cx(role === 'admin' && s.segOn)} onClick={() => setRole('admin')}>Administrador</button>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={inviting || !email.trim()}>
            <Ico.link style={{ width: 14, height: 14 }} />{inviting ? 'Creando…' : 'Crear invitación'}
          </button>
        </form>
        <p className={s.hint}>
          {role === 'employee'
            ? <><strong>Vendedor:</strong> registra contactos, leads y recordatorios, y atiende WhatsApp.</>
            : <><strong>Administrador:</strong> además ve el trabajo de todo el equipo y configura la tienda.</>}
        </p>
        {error && <div className={s.error}>{error}</div>}
        {newLink && (
          <div className={s.linkBox} ref={linkRef}>
            <strong>Invitación lista para {newLink.email}</strong>
            <div className={s.linkRow}>
              <input className={cx(s.input, s.mono)} readOnly value={newLink.link} onFocus={e => e.currentTarget.select()} aria-label="Enlace de invitación" />
              <button type="button" className="btn btn-dark" onClick={copy}><Ico.copy style={{ width: 14, height: 14 }} />Copiar</button>
              <a className={cx('btn', s.wa)} href={waShare(newLink.link)} target="_blank" rel="noopener noreferrer"><WhatsAppGlyph style={{ width: 15, height: 15 }} />WhatsApp</a>
            </div>
            <p className={s.hint}>Por seguridad este enlace solo se muestra ahora. Si lo pierdes, genera uno nuevo.</p>
          </div>
        )}
      </Panel>

      <Panel icon={Ico.users} tone="tCyan" title="Equipo" subtitle="Quién tiene acceso a esta tienda.">
        <div className={s.seats}>
          <span>Plan {store.planLabel}</span>
          <div className={s.seatBar}><i style={{ width: `${seatPct}%` }} /></div>
          <strong>{activeSeats} de {store.maxUsers} usuarios</strong>
        </div>
        {!members ? <Spinner /> : (
          <div className={s.members}>
            {members.map(m => {
              const name = m.display_name || m.email
              const tone = avatarTone(m.email)
              const off = m.status !== 'active'
              return (
                <div key={m.user_id} className={cx(s.member, off && s.memberOff)}>
                  <span className={s.avatar} style={{ background: tone.bg, color: tone.fg }}>{initialsOf(name)}</span>
                  <div className={s.memberMain}>
                    <strong><span>{name}</span>{m.isMe && <em className={s.you}>Tú</em>}</strong>
                    <small>{m.email} · {off ? 'Acceso desactivado' : lastSeen(m.last_sign_in_at)}</small>
                  </div>
                  <div className={s.memberActions}>
                    {m.canManage && m.role !== 'owner' ? (
                      <select
                        className={s.select} value={m.role} disabled={busyId === m.user_id} aria-label={`Rol de ${name}`}
                        onChange={e => act(m.user_id, () => api('/api/store/members', send('PATCH', { userId: m.user_id, role: e.target.value })), 'Rol actualizado')}
                      >
                        <option value="employee">Vendedor</option>
                        {(isOwner || m.role === 'admin') && <option value="admin" disabled={!isOwner}>Administrador</option>}
                      </select>
                    ) : (
                      <span className={cx(s.badge, ROLE_BADGE[m.role])}>{ROLE_LABELS[m.role]}</span>
                    )}
                    {off && <span className={cx(s.badge, s.bDanger, s.offBadge)}>Desactivado</span>}
                    {m.canManage && (confirmId === m.user_id ? (
                      <>
                        <button className={cx(s.mini, s.miniDanger)} disabled={busyId === m.user_id}
                          onClick={() => act(m.user_id, () => api('/api/store/members', send('DELETE', { userId: m.user_id })), `${name} ya no está en el equipo`)}>Quitar</button>
                        <button className={cx(s.mini, s.miniGhost)} onClick={() => setConfirmId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost" style={{ padding: '6px 11px', fontSize: 12.5 }} disabled={busyId === m.user_id}
                          onClick={() => act(m.user_id, () => api('/api/store/members', send('PATCH', { userId: m.user_id, status: off ? 'active' : 'disabled' })), off ? 'Acceso reactivado' : 'Acceso desactivado')}>
                          {off ? 'Reactivar' : 'Desactivar'}
                        </button>
                        <button className="icon-btn icon-btn-delete" title="Quitar del equipo" aria-label={`Quitar a ${name}`} onClick={() => setConfirmId(m.user_id)}><Ico.trash /></button>
                      </>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {pending.length > 0 && (
        <Panel icon={Ico.mail} tone="tAmber" title="Invitaciones pendientes" subtitle="Aún no crean su acceso. Puedes generar un enlace nuevo o cancelarlas.">
          <div className={s.members}>
            {pending.map(inv => {
              const tone = avatarTone(inv.email)
              const expired = inv.status === 'expired'
              const canTouch = isOwner || inv.role === 'employee'
              return (
                <div key={inv.id} className={s.member}>
                  <span className={s.avatar} style={{ background: tone.bg, color: tone.fg }}>{initialsOf(inv.email)}</span>
                  <div className={s.memberMain}>
                    <strong><span>{inv.email}</span></strong>
                    <small>{ROLE_LABELS[inv.role]} · {expired ? 'El enlace venció' : `Vence el ${fmtDate(inv.expiresAt, { day: 'numeric', month: 'long' })}`}</small>
                  </div>
                  <div className={s.memberActions}>
                    {expired && <span className={cx(s.badge, s.bWarn)}>Vencida</span>}
                    {canTouch ? (
                      <>
                        <button className="btn btn-ghost" style={{ padding: '6px 11px', fontSize: 12.5 }} disabled={busyId === inv.id}
                          onClick={() => act(inv.id, () => createInvite(inv.email, inv.role), 'Enlace nuevo generado')}>
                          Nuevo enlace
                        </button>
                        <button className="icon-btn icon-btn-delete" title="Cancelar invitación" aria-label={`Cancelar invitación de ${inv.email}`} disabled={busyId === inv.id}
                          onClick={() => act(inv.id, () => api(`/api/store/invitations/${inv.id}`, { method: 'DELETE' }), 'Invitación cancelada')}>
                          <Ico.trash />
                        </button>
                      </>
                    ) : (
                      <span className={cx(s.badge, s.bMuted)}>La gestiona el dueño</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}
      {toast}
    </>
  )
}
