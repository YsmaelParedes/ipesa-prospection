'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthAlert, AuthHeader, PasswordField, SubmitButton } from '@/components/AuthUI'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [expired, setExpired]   = useState(false)
  const [done, setDone]         = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) { setExpired(true); return }
      if (!res.ok) { setError(data.error || 'No se pudo cambiar la contraseña.'); return }
      setDone(true)
      setTimeout(() => { window.location.href = '/' }, 1400)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (expired) {
    return (
      <>
        <AuthHeader title="El enlace venció" subtitle="Por seguridad los enlaces para restablecer la contraseña duran poco." />
        <p className="auth-alt"><Link href="/recuperar" className="auth-link strong">Solicitar un enlace nuevo</Link></p>
      </>
    )
  }

  return (
    <>
      <AuthHeader title="Crea tu nueva contraseña" subtitle="Elige una que no uses en otros sitios." />
      {done && <AuthAlert kind="success">Listo, tu contraseña se cambió. Entrando…</AuthAlert>}
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} className="auth-form">
        <PasswordField label="Nueva contraseña" value={password} onChange={setPassword} showStrength autoComplete="new-password" autoFocus />
        <PasswordField label="Confirma la contraseña" value={confirm} onChange={setConfirm} autoComplete="new-password" id="f-password-confirm" />
        <SubmitButton loading={loading} disabled={done}>Guardar contraseña</SubmitButton>
      </form>
    </>
  )
}
