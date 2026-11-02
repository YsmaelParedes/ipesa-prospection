'use client'

import { useState } from 'react'
import { PasswordField } from '@/components/AuthUI'
import { BRAND_MARK } from '@/lib/brand'
import { invalidateSession, type Session } from '@/lib/profile'
import { ROLE_LABELS } from '@/lib/stores'
import { signOut } from '@/lib/signOut'
import { Card, CardFoot, Ico, Row, api, cx, send, useToast } from './ui'
import s from './configuracion.module.css'

/** Tu cuenta → Perfil: nombre, correo y las tiendas a las que tienes acceso. */
export function ProfileTab({ session }: { session: Session }) {
  const [toast, showToast] = useToast()
  const [name, setName]       = useState(session.user.name)
  const [savedName, setSaved] = useState(session.user.name)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  const dirty = name.trim() !== savedName
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const d = await api<{ name: string }>('/api/me', send('PATCH', { name: name.trim() }))
      setSaved(d.name)
      setName(d.name)
      invalidateSession()
      showToast('Nombre actualizado')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card as="form" onSubmit={save}>
        <Row label="Nombre" htmlFor="me-name" hint="Así te ve tu equipo en el sistema comercial, la agenda y las conversaciones.">
          <input id="me-name" className={s.input} value={name} onChange={e => { setName(e.target.value); setError('') }}
            minLength={2} maxLength={60} required autoComplete="name" />
          {error && <div className={s.error}>{error}</div>}
        </Row>
        <Row label="Correo" hint="Con él entras a la app. No se puede cambiar." align="center">
          <span className={s.readValue}>{session.user.email}</span>
        </Row>
        <CardFoot status={dirty ? 'Tienes cambios sin guardar' : undefined}>
          {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setName(savedName); setError('') }}>Descartar</button>}
          <button type="submit" className="btn btn-primary" disabled={busy || !dirty || name.trim().length < 2}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </CardFoot>
      </Card>

      <Card title={session.stores.length > 1 ? 'Tus tiendas' : 'Tu tienda'} description="Las tiendas a las que tienes acceso con esta cuenta y tu rol en cada una.">
        <ul className={s.stores}>
          {session.stores.map(st => (
            <li key={st.id} className={s.storeRow}>
              <img src={st.logoUrl || BRAND_MARK} alt="" />
              <strong>{st.name}</strong>
              {st.id === session.store?.id && session.stores.length > 1 && <span className={cx(s.badge, s.bActive)}>Abierta</span>}
              <span className={cx(s.badge, st.role === 'admin' ? s.bTrial : s.bMuted)}>{ROLE_LABELS[st.role]}</span>
            </li>
          ))}
        </ul>
      </Card>
      {toast}
    </>
  )
}

/** Tu cuenta → Seguridad: cambiar la contraseña y cerrar la sesión. */
export function SecurityTab() {
  const [toast, showToast] = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')

  const change = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden.'); return }
    setBusy(true)
    try {
      await api('/api/auth/password', send('POST', { currentPassword: current, password: next }))
      setCurrent('')
      setNext('')
      setConfirm('')
      showToast('Contraseña actualizada')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card as="form" onSubmit={change} title="Contraseña" description="Al cambiarla cerramos tu sesión en los demás dispositivos.">
        <div className={s.cardBody}>
          <div className={s.passwordFields}>
            <PasswordField id="pw-current" label="Contraseña actual" value={current} onChange={setCurrent} autoComplete="current-password" />
            <PasswordField id="pw-new" label="Nueva contraseña" value={next} onChange={setNext} showStrength autoComplete="new-password" />
            <PasswordField id="pw-confirm" label="Confirma la nueva contraseña" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            {error && <div className={s.error}>{error}</div>}
          </div>
        </div>
        <CardFoot>
          <button type="submit" className="btn btn-primary" disabled={busy || !current || !next || !confirm}>
            {busy ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </CardFoot>
      </Card>

      <Card>
        <Row label="Cerrar sesión" hint="Sales de tu cuenta en este dispositivo." align="center">
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
              <Ico.logout style={{ width: 15, height: 15 }} />Cerrar sesión
            </button>
          </div>
        </Row>
      </Card>
      {toast}
    </>
  )
}
