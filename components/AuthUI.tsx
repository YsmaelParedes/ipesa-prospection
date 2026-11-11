'use client'

import { useEffect, useState } from 'react'
import { Mail, Lock, User, Store, MapPin, Phone, ArrowRight, CircleAlert, Check, Inbox } from 'lucide-react'

/* Piezas compartidas de las pantallas de acceso (login, registro, recuperar…) */

/* Iconos de Lucide */
export const AuthIcon = {
  mail: Mail, lock: Lock, user: User, store: Store, pin: MapPin, phone: Phone,
  arrow: ArrowRight, alert: CircleAlert, check: Check, inbox: Inbox,
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="auth-head">
      {/* Las cuatro franjas del logo, como muestras de color */}
      <div className="auth-bars" aria-hidden="true"><span /><span /><span /><span /></div>
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
  icon?: React.ComponentType<any>
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

export function PasswordField({ label, value, onChange, showStrength, autoComplete = 'current-password', id = 'f-password', autoFocus, labelAside }: {
  label: string; value: string; onChange: (v: string) => void; showStrength?: boolean; autoComplete?: string; id?: string; autoFocus?: boolean
  /** Junto a la etiqueta, a la derecha (ej. «¿La olvidaste?»). */
  labelAside?: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const score = passwordScore(value)
  return (
    <div className="auth-field">
      {labelAside
        ? <div className="auth-label-row"><label htmlFor={id}>{label}</label>{labelAside}</div>
        : <label htmlFor={id}>{label}</label>}
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

export function SubmitButton({ loading, children, disabled, dark }: { loading: boolean; children: React.ReactNode; disabled?: boolean; dark?: boolean }) {
  return (
    <button type="submit" className={dark ? 'auth-submit secondary' : 'auth-submit'} disabled={loading || disabled}>
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
