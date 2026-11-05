'use client'

import Link from '@/components/CachedLink'
import { useQueryEffect } from '@/lib/useCachedQuery'


import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_NAME } from '@/lib/brand'
import type { ClientStore } from '@/lib/profile'
import { PLANS, ROLE_LABELS, type StoreRole } from '@/lib/stores'
import { Select } from '@/components/Select'
import { Card, Ico, Note, Spinner, WhatsAppGlyph, api, avatarTone, copyText, cx, fmtDate, initialsOf, send, useToast } from './ui'
import s from './configuracion.module.css'

type Member = {
  user_id: string; email: string; display_name: string; role: StoreRole; status: 'active' | 'disabled' | string
  joined_at: string; last_sign_in_at: string | null; isMe: boolean; isMain?: boolean; canManage: boolean
}
type Invitation = { id: string; email: string; role: 'admin' | 'employee'; expiresAt: string; status: 'valid' | 'expired' | 'used' | 'revoked' }
type NewLink = { email: string; link: string }

const ROLE_BADGE: Record<StoreRole, string> = { admin: s.bTrial, employee: s.bMuted }

function lastSeen(iso: string | null) {
  if (!iso) return 'Aún no entra'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Activo hoy'
  if (days === 1) return 'Activo ayer'
  if (days < 30) return `Activo hace ${days} días`
  return `Último acceso: ${fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function TeamTab({ store }: { store: ClientStore }) {
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
  const [inviteOpen, setInviteOpen] = useState(false)
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
      setLoadErr('')
      setMembers(m.members)
      setInvites(i.invitations)
    } catch (err) {
      setLoadErr((err as Error).message)
    }
  }, [])
  useQueryEffect(() => { load() }, [load])

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
    `Hola, te invito a unirte al equipo de ${store.name} en ${APP_NAME}. Entra o crea tu cuenta con el correo al que te invité y acepta aquí: ${link}`,
  )}`

  const pending = invites.filter(i => i.status === 'valid' || i.status === 'expired')
  const activeSeats = (members?.filter(m => m.status === 'active').length ?? 0) + invites.filter(i => i.status === 'valid').length
  const seatPct = Math.min(100, (activeSeats / store.maxUsers) * 100)

  if (loadError) return <Note kind="danger">{loadError}</Note>

  const full = activeSeats >= store.maxUsers
  const inviteForm = (
    <div className={s.inviteBox} ref={linkRef}>
      {newLink ? (
        <div className={s.linkBox}>
          <strong>Invitación lista para {newLink.email}</strong>
          <div className={s.linkRow}>
            <input className={cx(s.input, s.mono)} readOnly value={newLink.link} onFocus={e => e.currentTarget.select()} aria-label="Enlace de invitación" />
            <button type="button" className="btn btn-dark" onClick={copy}><Ico.copy style={{ width: 14, height: 14 }} />Copiar</button>
            <a className={cx('btn', s.wa)} href={waShare(newLink.link)} target="_blank" rel="noopener noreferrer"><WhatsAppGlyph style={{ width: 15, height: 15 }} />WhatsApp</a>
          </div>
          <p className={s.hint}>Por seguridad este enlace solo se muestra ahora. Si lo pierdes, genera uno nuevo.</p>
          <div className={s.inviteBoxFoot}>
            <button type="button" className="btn btn-ghost" onClick={() => { setNewLink(null); setInviteOpen(false) }}>Listo</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className={s.inviteForm}>
            <input className={s.input} type="email" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="correo@ejemplo.com" aria-label="Correo de la persona" autoComplete="off" autoFocus />
            <div className={s.seg} role="radiogroup" aria-label="Rol">
              <button type="button" role="radio" aria-checked={role === 'employee'} className={cx(role === 'employee' && s.segOn)} onClick={() => setRole('employee')}>Vendedor</button>
              {store.allowAdmins && <button type="button" role="radio" aria-checked={role === 'admin'} className={cx(role === 'admin' && s.segOn)} onClick={() => setRole('admin')}>Administrador</button>}
            </div>
          </div>
          <p className={s.hint}>
            {role === 'employee'
              ? <><strong>Vendedor:</strong> entra con su propio usuario y en el sistema comercial trabaja solo los contactos que le asignes; los contactos son de toda la tienda{store.modules.whatsapp ? ', y atiende WhatsApp' : ''}.</>
              : <><strong>Administrador:</strong> además ve el trabajo de todo el equipo y configura la tienda.</>}
            {' '}El enlace vence en 7 días y solo sirve para ese correo.
          </p>
          {error && <div className={s.error}>{error}</div>}
          <div className={s.inviteBoxFoot}>
            <button type="button" className="btn btn-ghost" onClick={() => { setInviteOpen(false); setError('') }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={inviting || !email.trim()}>
              <Ico.link style={{ width: 14, height: 14 }} />{inviting ? 'Creando…' : 'Crear invitación'}
            </button>
          </div>
        </form>
      )}
    </div>
  )

  return (
    <>
      {store.maxUsers <= 1 && (
        <Note kind="info">
          El plan {store.planLabel} incluye solo al administrador. Para sumar a tu equipo cambia a Galón (hasta {PLANS.galon.maxUsers} usuarios) o Cubeta (hasta {PLANS.cubeta.maxUsers}, con administradores).{' '}
          <Link href="/configuracion?tab=plan" className="auth-link strong">Ver planes</Link>
        </Note>
      )}

      <Card
        title="Miembros"
        description={`${activeSeats} de ${store.maxUsers} usuarios del plan ${store.planLabel}`}
        actions={store.maxUsers > 1 && !inviteOpen && !newLink && (
          <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)} disabled={full} title={full ? 'Ya usas todos los lugares de tu plan' : undefined}>
            <Ico.userPlus style={{ width: 15, height: 15 }} />Invitar
          </button>
        )}
      >
        <div className={s.seatBar} aria-hidden="true"><i style={{ width: `${seatPct}%` }} /></div>
        {(inviteOpen || newLink) && inviteForm}
        {!inviteOpen && !newLink && error && <div className={cx(s.error, s.padX)}>{error}</div>}

        {!members ? <Spinner /> : (
          <ul className={s.members}>
            {members.map(m => {
              const name = m.display_name || m.email
              const tone = avatarTone(m.email)
              const off = m.status !== 'active'
              return (
                <li key={m.user_id} className={cx(s.member, off && s.memberOff)}>
                  <span className={s.avatar} style={{ background: tone.bg, color: tone.fg }}>{initialsOf(name)}</span>
                  <div className={s.memberMain}>
                    <strong><span>{name}</span>{m.isMe && <em className={s.you}>Tú</em>}</strong>
                    <small>{m.email} · {off ? 'Acceso desactivado' : lastSeen(m.last_sign_in_at)}</small>
                  </div>
                  <div className={s.memberActions}>
                    {m.canManage ? (
                      <Select
                        className={s.select} value={m.role} disabled={busyId === m.user_id} aria-label={`Rol de ${name}`}
                        onChange={role => act(m.user_id, () => api('/api/store/members', send('PATCH', { userId: m.user_id, role })), 'Rol actualizado')}
                        options={[
                          { value: 'employee', label: 'Vendedor', hint: 'Trabaja los contactos que le asignes' },
                          ...((store.allowAdmins || m.role === 'admin')
                            ? [{ value: 'admin', label: 'Administrador', hint: 'Configura la tienda y ve todo', disabled: !store.allowAdmins }]
                            : []),
                        ]}
                      />
                    ) : (
                      <span className={cx(s.badge, ROLE_BADGE[m.role])}>{m.isMain ? 'Administrador principal' : ROLE_LABELS[m.role]}</span>
                    )}
                    {m.canManage && (confirmId === m.user_id ? (
                      <>
                        <button className={cx(s.mini, s.miniDanger)} disabled={busyId === m.user_id}
                          onClick={() => act(m.user_id, () => api('/api/store/members', send('DELETE', { userId: m.user_id })), `${name} ya no está en el equipo`)}>Quitar</button>
                        <button className={cx(s.mini, s.miniGhost)} onClick={() => setConfirmId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className={cx('btn btn-ghost', s.btnSm)} disabled={busyId === m.user_id}
                          onClick={() => act(m.user_id, () => api('/api/store/members', send('PATCH', { userId: m.user_id, status: off ? 'active' : 'disabled' })), off ? 'Acceso reactivado' : 'Acceso desactivado')}>
                          {off ? 'Reactivar' : 'Desactivar'}
                        </button>
                        <button className="icon-btn icon-btn-delete" title="Quitar del equipo" aria-label={`Quitar a ${name}`} onClick={() => setConfirmId(m.user_id)}><Ico.trash /></button>
                      </>
                    ))}
                  </div>
                </li>
              )
            })}

            {/* Las invitaciones van en la misma lista, debajo de quienes ya entraron */}
            {pending.map(inv => {
              const expired = inv.status === 'expired'
              return (
                <li key={inv.id} className={s.member}>
                  <span className={cx(s.avatar, s.avatarPending)}><Ico.mail /></span>
                  <div className={s.memberMain}>
                    <strong><span>{inv.email}</span></strong>
                    <small>{ROLE_LABELS[inv.role]} · {expired ? 'El enlace venció' : `Invitación pendiente, vence el ${fmtDate(inv.expiresAt, { day: 'numeric', month: 'long' })}`}</small>
                  </div>
                  <div className={s.memberActions}>
                    <span className={cx(s.badge, expired ? s.bWarn : s.bMuted)}>{expired ? 'Vencida' : 'Pendiente'}</span>
                    <button className={cx('btn btn-ghost', s.btnSm)} disabled={busyId === inv.id}
                      onClick={() => act(inv.id, () => createInvite(inv.email, inv.role), 'Enlace nuevo generado')}>
                      Nuevo enlace
                    </button>
                    <button className="icon-btn icon-btn-delete" title="Cancelar invitación" aria-label={`Cancelar invitación de ${inv.email}`} disabled={busyId === inv.id}
                      onClick={() => act(inv.id, () => api(`/api/store/invitations/${inv.id}`, { method: 'DELETE' }), 'Invitación cancelada')}>
                      <Ico.trash />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {toast}
    </>
  )
}
