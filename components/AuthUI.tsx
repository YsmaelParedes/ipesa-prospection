'use client'

import { useEffect, useState } from 'react'
import { BrandLogo } from '@/components/Brand'

/* Piezas compartidas de las pantallas de acceso (login, registro, recuperar…) */

export const AuthIcon = {
  mail:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  lock:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  user:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  store: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9 4.5 4h15L21 9"/><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z"/><path d="M5 13v7h14v-7"/></svg>,
  pin:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>,
  phone: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>,
  arrow: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
  alert: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
  check: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m5 13 4 4L19 7"/></svg>,
  inbox: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/></svg>,
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="auth-head">
      <BrandLogo className="auth-logo-mobile" />
      <h1 className="auth-title">{title}</h1>
      {subtitle && <p className="auth-sub">{subtitle}</p>}
    </div>
  )
}

export function AuthAlert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const Ic = kind === 'success' ? AuthIcon.check : AuthIcon.alert
  return (
    <div className={`auth-alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Ic className="auth-alert-icon" />
      <div>{children}</div>
    </div>
  )
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon?: (p: any) => React.ReactElement
  hint?: React.ReactNode
}

export function AuthField({ label, icon: Ic, hint, id, ...input }: FieldProps) {
  const fieldId = id ?? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="auth-field">
      <label htmlFor={fieldId}>{label}</label>
      <div className="auth-input">
        {Ic && <Ic className="auth-input-icon" />}
        <input id={fieldId} {...input} />
      </div>
      {hint && <div className="auth-hint">{hint}</div>}
    </div>
  )
}

/** 0–4 según largo y variedad de caracteres (orientativo, no reemplaza al servidor). */
export function passwordScore(pw: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) s = Math.min(s, 1)
  return Math.min(s, 4)
}
const SCORE_LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente']

export function PasswordField({ label, value, onChange, showStrength, autoComplete = 'current-password', id = 'f-password', autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; showStrength?: boolean; autoComplete?: string; id?: string; autoFocus?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const score = passwordScore(value)
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input">
        <AuthIcon.lock className="auth-input-icon" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          minLength={showStrength ? 8 : undefined}
          maxLength={72}
        />
        <button type="button" className="auth-toggle" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {showStrength && value && (
        <div className="pw-meter" aria-live="polite">
          <div className="pw-bars">{[0, 1, 2, 3].map(i => <span key={i} className={i < score ? `on s${score}` : ''} />)}</div>
          <span className={`pw-label s${score}`}>{SCORE_LABELS[score]}</span>
        </div>
      )}
      {showStrength && <div className="auth-hint">Mínimo 8 caracteres, con letras y números.</div>}
    </div>
  )
}

export function SubmitButton({ loading, children, disabled }: { loading: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" className="auth-submit" disabled={loading || disabled}>
      {loading ? <span className="auth-spinner" /> : null}
      <span>{children}</span>
      {!loading && <AuthIcon.arrow className="auth-submit-arrow" />}
    </button>
  )
}

/** Reenvía el correo de confirmación de la cuenta, con espera entre intentos. */
export function ResendConfirmation({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const resend = async () => {
    setState('sending')
    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setState('error'); setMessage(data.error || 'No se pudo reenviar el correo.'); return }
      setState('sent')
      setWait(60)
    } catch {
      setState('error')
      setMessage('Error de conexión. Intenta de nuevo.')
    }
  }

  return (
    <div className="auth-resend">
      <button type="button" className="auth-link strong" onClick={resend} disabled={state === 'sending' || wait > 0}>
        {state === 'sending' ? 'Reenviando…' : wait > 0 ? `Reenviar en ${wait} s` : 'Reenviar el correo de confirmación'}
      </button>
      {state === 'sent' && <span className="auth-resend-ok">Listo, te lo enviamos de nuevo.</span>}
      {state === 'error' && <span className="auth-resend-err">{message}</span>}
    </div>
  )
}
