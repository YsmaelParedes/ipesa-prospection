'use client'

import { useState } from 'react'
import { PasswordField } from '@/components/AuthUI'
import { BRAND_MARK } from '@/lib/brand'
import { invalidateSession, type Session } from '@/lib/profile'
import { ROLE_LABELS } from '@/lib/stores'
import { signOut } from '@/lib/signOut'
import { Ico, Panel, api, cx, send, useToast } from './ui'
import { NotificationsPanel } from './NotificationsPanel'
import s from './configuracion.module.css'

export function AccountTab({ session }: { session: Session }) {
  const [toast, showToast] = useToast()
  const [name, setName]       = useState(session.user.name)
  const [savedName, setSaved] = useState(session.user.name)
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState('')

  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwBusy, setPwBusy]   = useState(false)
  const [pwError, setPwError] = useState('')

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameError('')
    setNameBusy(true)
    try {
      const d = await api<{ name: string }>('/api/me', send('PATCH', { name: name.trim() }))
      setSaved(d.name)
      setName(d.name)
      invalidateSession()
      showToast('Nombre actualizado')
    } catch (err) {
      setNameError((err as Error).message)
    } finally {
      setNameBusy(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    if (next !== confirm) { setPwError('Las contraseñas nuevas no coinciden.'); return }
    setPwBusy(true)
    try {
      await api('/api/auth/password', send('POST', { currentPassword: current, password: next }))
      setCurrent('')
      setNext('')
      setConfirm('')
      showToast('Contraseña actualizada')
    } catch (err) {
      setPwError((err as Error).message)
    } finally {
      setPwBusy(false)
    }
  }


  return (
    <>
      <Panel icon={Ico.user} title="Tu perfil" subtitle="Así te ve tu equipo en leads, actividades y conversaciones.">
        <form onSubmit={saveName} className={s.formGrid}>
          <div className="field">
            <label htmlFor="me-name">Nombre</label>
            <input id="me-name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={60} required autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="me-email">Correo</label>
            <input id="me-email" value={session.user.email} readOnly disabled />
          </div>
          {nameError && <div className={cx(s.error, s.span2)}>{nameError}</div>}
          <div className={cx(s.formFoot, s.span2)}>
            <button type="submit" className="btn btn-primary" disabled={nameBusy || name.trim() === savedName || name.trim().length < 2}>
              {nameBusy ? 'Guardando…' : 'Guardar nombre'}
            </button>
          </div>
        </form>
      </Panel>

      <NotificationsPanel />

      <Panel icon={Ico.lock} tone="tInk" title="Contraseña" subtitle="Al cambiarla cerramos tu sesión en los demás dispositivos.">
        <form onSubmit={changePassword} className={s.accountForm}>
          <PasswordField id="pw-current" label="Contraseña actual" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField id="pw-new" label="Nueva contraseña" value={next} onChange={setNext} showStrength autoComplete="new-password" />
          <PasswordField id="pw-confirm" label="Confirma la nueva contraseña" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {pwError && <div className={s.error}>{pwError}</div>}
          <div>
            <button type="submit" className="btn btn-dark" disabled={pwBusy || !current || !next || !confirm}>
              {pwBusy ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel icon={Ico.store} tone="tCyan" title="Tus tiendas" subtitle="Tiendas a las que tienes acceso con esta cuenta."
        actions={<button className="btn btn-ghost" onClick={() => signOut()}><Ico.logout style={{ width: 14, height: 14 }} />Cerrar sesión</button>}>
        <div className={s.stores}>
          {session.stores.map(st => (
            <div key={st.id} className={s.storeRow}>
              <img src={st.logoUrl || BRAND_MARK} alt="" />
              <strong>{st.name}</strong>
              <span className={cx(s.badge, st.role === 'owner' ? s.bBrand : st.role === 'admin' ? s.bTrial : s.bMuted)}>{ROLE_LABELS[st.role]}</span>
              {st.id === session.store?.id && <span className={cx(s.badge, s.bActive)}>Activa</span>}
            </div>
          ))}
        </div>
      </Panel>
      {toast}
    </>
  )
}
