'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthAlert, AuthField, AuthHeader, AuthIcon, SubmitButton } from '@/components/AuthUI'

export default function RecoverPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo enviar el enlace.'); return }
      setSent(true)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-done">
        <div className="auth-done-icon"><AuthIcon.inbox /></div>
        <h1 className="auth-title">Revisa tu correo</h1>
        <p className="auth-sub">Si hay una cuenta con <strong>{email.trim()}</strong>, te enviamos un enlace para crear una contraseña nueva.</p>
        <AuthAlert kind="info">Ábrelo en este mismo dispositivo. Si no lo ves, revisa spam o promociones.</AuthAlert>
        <p className="auth-alt"><Link href="/login" className="auth-link strong">Volver a iniciar sesión</Link></p>
      </div>
    )
  }

  return (
    <>
      <AuthHeader title="Recupera tu acceso" subtitle="Escribe tu correo y te mandamos un enlace para crear una contraseña nueva." />
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} className="auth-form">
        <AuthField label="Correo electrónico" icon={AuthIcon.mail} type="email" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus required maxLength={254} placeholder="tu@correo.com" />
        <SubmitButton loading={loading}>Enviar enlace</SubmitButton>
      </form>
      <p className="auth-alt"><Link href="/login" className="auth-link strong">Volver a iniciar sesión</Link></p>
    </>
  )
}
