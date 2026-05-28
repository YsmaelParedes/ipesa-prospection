'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Credenciales incorrectas. Verifica tu correo y contraseña.')
        return
      }
      // Derive display name from email (before @)
      try {
        const raw = email.split('@')[0].replace(/[._-]/g, ' ')
        const name = raw.replace(/\b\w/g, l => l.toUpperCase())
        localStorage.setItem('ipesa_display_name', name)
      } catch {}
      window.location.href = '/'
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-form-wrap">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-brand">
            <img
              src="/ipesa-logo.png"
              alt="IPESA Pinturas"
              style={{ height: 64, objectFit: 'contain', display: 'block', margin: '0 auto' }}
            />
          </div>

          <h2 className="login-form-title">Acceso staff</h2>
          <p className="login-form-sub">Ingresa tus credenciales para acceder al sistema.</p>

          {error && (
            <div className="login-error">
              <svg style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>{error}</span>
            </div>
          )}

          <div className="login-field">
            <label>Correo electrónico</label>
            <div className="login-input-wrap">
              <svg className="login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
              <input
                type="email"
                placeholder="usuario@ipesa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label>Contraseña</label>
            <div className="login-input-wrap">
              <svg className="login-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button" className="login-toggle" onClick={() => setShowPass(s => !s)}>
                {showPass ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 24 }} />

          <button type="submit" className="login-submit" disabled={loading || !email || !password}>
            {loading ? (
              <><span className="login-spinner"></span> Verificando…</>
            ) : (
              <>Ingresar al sistema
                <svg style={{ width: 16, height: 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </>
            )}
          </button>

          <div className="login-foot-help" style={{ marginTop: 20 }}>
            ¿Problemas para acceder? <a href="#">Contacta a soporte interno</a>
          </div>
        </form>
      </div>
    </div>
  )
}
