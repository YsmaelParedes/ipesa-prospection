'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AuthAlert, AuthField, AuthHeader, AuthIcon, PasswordField, ResendConfirmation, SubmitButton } from '@/components/AuthUI'
import { APP_NAME } from '@/lib/brand'
import { safeNext } from '@/lib/safeNext'

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>
}

function LoginForm() {
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const linkError = params.get('error') === 'enlace'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [unconfirmed, setUnconfirmed] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setUnconfirmed('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.code === 'EMAIL_NOT_CONFIRMED') { setUnconfirmed(email.trim().toLowerCase()); return }
      if (!res.ok) { setError(data.error || 'No pudimos iniciar sesión.'); return }
      window.location.href = next
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AuthHeader title="Bienvenido de vuelta" subtitle="Entra a la cuenta de tu tienda." />
      {linkError && <AuthAlert kind="info">El enlace no es válido o ya venció. Inicia sesión o solicita uno nuevo.</AuthAlert>}
      {error && <AuthAlert>{error}</AuthAlert>}
      {unconfirmed && (
        <AuthAlert kind="info">
          Tu correo aún no está confirmado. Abre el enlace que te enviamos a <strong>{unconfirmed}</strong>.
          <ResendConfirmation email={unconfirmed} />
        </AuthAlert>
      )}
      <form onSubmit={submit} className="auth-form">
        <AuthField
          label="Correo electrónico" icon={AuthIcon.mail} type="email" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus required maxLength={254}
          placeholder="tu@correo.com"
        />
        <PasswordField label="Contraseña" value={password} onChange={setPassword} />
        <div className="auth-row-end">
          <Link href="/recuperar" className="auth-link">¿Olvidaste tu contraseña?</Link>
        </div>
        <SubmitButton loading={loading}>Entrar</SubmitButton>
      </form>
      <p className="auth-alt">¿Tu tienda aún no usa {APP_NAME}? <Link href="/registro" className="auth-link strong">Pruébalo gratis</Link></p>
    </>
  )
}
