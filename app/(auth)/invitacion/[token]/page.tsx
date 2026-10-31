'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { AuthAlert, AuthHeader, AuthIcon, SubmitButton } from '@/components/AuthUI'
import { ROLE_LABELS } from '@/lib/stores'
import { forgetPendingInvite, rememberPendingInvite } from '@/lib/pendingInvite'
import { signOut } from '@/lib/signOut'

type Info = {
  store: { name: string; logoUrl: string | null }
  role: 'admin' | 'employee'
  email: string
  status: 'valid' | 'expired' | 'used' | 'revoked'
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
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch(`/api/invitations/${encodeURIComponent(token)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Esta invitación no existe')
        if (d.status !== 'valid') forgetPendingInvite()
        setInfo(d)
      })
      .catch(e => { forgetPendingInvite(); setLoadErr(e.message) })
  }, [token])

  const accept = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo aceptar la invitación.'); return }
      forgetPendingInvite()
      window.location.href = '/'
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
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
            <button className="auth-submit secondary" onClick={() => signOut(null)}>Cerrar sesión y cambiar de cuenta</button>
          </>
        )}
      </>
    )
  }

  // Sin sesión: la invitación no crea cuentas. Entra con la cuenta de ese
  // correo o créala en Registro; al confirmar el correo en este dispositivo,
  // /bienvenida lo regresa aquí para aceptar.
  return (
    <>
      <AuthHeader title="Únete al equipo" subtitle={<>La invitación es para <strong>{info.email}</strong>. Entra con esa cuenta para aceptarla.</>} />
      {head}
      <Link href={`/login?next=${encodeURIComponent(`/invitacion/${token}`)}`} className="auth-submit as-link">Iniciar sesión y aceptar</Link>
      <p className="auth-alt">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/registro" className="auth-link strong" onClick={() => rememberPendingInvite(token)}>Crea tu cuenta con ese correo</Link>
        {' '}y después vuelve a abrir este enlace.
      </p>
    </>
  )
}
