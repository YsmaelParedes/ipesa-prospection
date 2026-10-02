'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { AuthAlert, AuthField, AuthHeader, AuthIcon, PasswordField, SubmitButton } from '@/components/AuthUI'
import { ROLE_LABELS } from '@/lib/stores'

type Info = {
  store: { name: string; logoUrl: string | null }
  role: 'admin' | 'employee'
  email: string
  status: 'valid' | 'expired' | 'used' | 'revoked'
  accountExists: boolean
  signedInAs: { email: string; matches: boolean } | null
}

const STATUS_COPY = {
  expired: 'Esta invitación ya venció. Pide a tu tienda que te envíe una nueva.',
  used:    'Esta invitación ya se usó. Si es tuya, inicia sesión.',
  revoked: 'Esta invitación fue cancelada por la tienda.',
}

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [info, setInfo]         = useState<Info | null>(null)
  const [loadError, setLoadErr] = useState('')
  const [name, setName]         = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch(`/api/invitations/${encodeURIComponent(token)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Esta invitación no existe')
        setInfo(d)
      })
      .catch(e => setLoadErr(e.message))
  }, [token])

  const accept = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info?.signedInAs ? {} : { name, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo aceptar la invitación.'); return }
      window.location.href = data.signedIn === false ? '/login' : '/'
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  if (loadError) {
    return (
      <>
        <AuthHeader title="Invitación no válida" subtitle={loadError} />
        <p className="auth-alt"><Link href="/login" className="auth-link strong">Ir a iniciar sesión</Link></p>
      </>
    )
  }
  if (!info) return <div className="auth-loading"><span className="auth-spinner dark" /></div>

  const roleLabel = ROLE_LABELS[info.role].toLowerCase()
  const head = (
    <div className="invite-store">
      {info.store.logoUrl
        ? <img src={info.store.logoUrl} alt="" className="invite-store-logo" />
        : <span className="invite-store-icon"><AuthIcon.store /></span>}
      <div>
        <div className="invite-store-label">Te invitaron a unirte a</div>
        <div className="invite-store-name">{info.store.name}</div>
        <div className="invite-store-role">como {roleLabel}</div>
      </div>
    </div>
  )

  if (info.status !== 'valid') {
    return (
      <>
        <AuthHeader title="Invitación no disponible" />
        {head}
        <AuthAlert kind="info">{STATUS_COPY[info.status]}</AuthAlert>
        <p className="auth-alt"><Link href="/login" className="auth-link strong">Ir a iniciar sesión</Link></p>
      </>
    )
  }

  if (info.signedInAs) {
    return (
      <>
        <AuthHeader title="Únete al equipo" />
        {head}
        {error && <AuthAlert>{error}</AuthAlert>}
        {info.signedInAs.matches ? (
          <form onSubmit={accept} className="auth-form">
            <SubmitButton loading={loading}>Aceptar invitación</SubmitButton>
          </form>
        ) : (
          <>
            <AuthAlert kind="info">
              Entraste como <strong>{info.signedInAs.email}</strong>, pero la invitación es para <strong>{info.email}</strong>.
            </AuthAlert>
            <button className="auth-submit secondary" onClick={logout}>Cerrar sesión y cambiar de cuenta</button>
          </>
        )}
      </>
    )
  }

  if (info.accountExists) {
    return (
      <>
        <AuthHeader title="Únete al equipo" />
        {head}
        <AuthAlert kind="info">Ya tienes una cuenta con <strong>{info.email}</strong>. Inicia sesión para aceptar.</AuthAlert>
        <Link href={`/login?next=${encodeURIComponent(`/invitacion/${token}`)}`} className="auth-submit as-link">Iniciar sesión y aceptar</Link>
      </>
    )
  }

  return (
    <>
      <AuthHeader title="Únete al equipo" subtitle={<>Crea tu acceso con el correo <strong>{info.email}</strong>.</>} />
      {head}
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={accept} className="auth-form">
        <AuthField label="Tu nombre" icon={AuthIcon.user} value={name} onChange={e => setName(e.target.value)}
          autoComplete="name" autoFocus required maxLength={60} placeholder="Nombre y apellido" />
        <PasswordField label="Crea tu contraseña" value={password} onChange={setPassword} showStrength autoComplete="new-password" />
        <SubmitButton loading={loading}>Unirme a la tienda</SubmitButton>
      </form>
      <p className="auth-fine">Al unirte aceptas los <Link href="/terminos" className="auth-link">términos</Link> y el <Link href="/privacidad" className="auth-link">aviso de privacidad</Link>.</p>
    </>
  )
}
