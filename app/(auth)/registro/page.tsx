'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AuthAlert, AuthField, AuthHeader, AuthIcon, PasswordField, ResendConfirmation, SubmitButton } from '@/components/AuthUI'
import { PLANS, TRIAL_DAYS } from '@/lib/stores'
import { savePlanIntent, type PlanIntent } from '@/lib/planIntent'
import { EVENTS, track } from '@/lib/analytics'
import { TURNSTILE_SITE_KEY, Turnstile, type TurnstileHandle } from '@/components/Turnstile'

/**
 * Registro abierto: la cuenta nace sin tienda; al confirmar el correo,
 * /bienvenida crea la tienda con la prueba de Cubeta (14 días, sin tarjeta) y
 * su administrador decide después qué plan activa. Si viene de un plan de la
 * página de precios (?plan=galon), se recuerda para ofrecerlo al terminar.
 */
export default function RegisterPage() {
  const [intent, setIntent] = useState<PlanIntent | null>(null)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const plan = sp.get('plan')
    if (plan !== 'galon' && plan !== 'cubeta') return
    const chosen: PlanIntent = { plan, interval: sp.get('periodo') === 'anual' ? 'year' : 'month' }
    savePlanIntent(chosen)
    setIntent(chosen)
  }, [])

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [accept, setAccept]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [sentTo, setSentTo]     = useState('')
  const [captcha, setCaptcha]   = useState('')
  const turnstile = useRef<TurnstileHandle>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!accept) { setError('Para continuar acepta los términos y el aviso de privacidad.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, acceptTerms: accept, captcha }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo crear la cuenta.'); turnstile.current?.reset(); return }
      track(EVENTS.accountCreated)
      if (data.needsConfirmation) setSentTo(email.trim().toLowerCase())
      else window.location.href = '/bienvenida'
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <div className="auth-done">
        <div className="auth-done-icon"><AuthIcon.inbox /></div>
        <h1 className="auth-title">Revisa tu correo</h1>
        <p className="auth-sub">
          Te enviamos un enlace a <strong>{sentTo}</strong> para confirmar tu cuenta. Ábrelo para configurar tu tienda.
        </p>
        <AuthAlert kind="info">
          ¿No te llegó? Revisa la carpeta de spam o promociones. El enlace vence en 24 horas.
          <ResendConfirmation email={sentTo} />
        </AuthAlert>
        <p className="auth-alt"><Link href="/login" className="auth-link strong">Volver a iniciar sesión</Link></p>
      </div>
    )
  }

  return (
    <>
      <AuthHeader title="Crea la cuenta de tu tienda"
        subtitle={intent
          ? <>Elegiste {PLANS[intent.plan].label}. Empieza con {TRIAL_DAYS} días de Cubeta gratis, sin tarjeta; al configurar tu tienda lo dejamos listo para activar.</>
          : <>Empieza con {TRIAL_DAYS} días de Cubeta gratis, sin tarjeta. Después eliges tu plan o sigues en Litro, gratis.</>} />
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} className="auth-form">
        <AuthField label="Tu nombre" icon={AuthIcon.user} value={name} onChange={e => setName(e.target.value)}
          autoComplete="name" autoFocus required maxLength={60} placeholder="Nombre y apellido" />
        <AuthField label="Correo electrónico" icon={AuthIcon.mail} type="email" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} placeholder="tu@correo.com" />
        <PasswordField label="Contraseña" value={password} onChange={setPassword} showStrength autoComplete="new-password" />
        <label className="auth-check">
          <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />
          <span>Acepto los <Link href="/terminos" target="_blank" className="auth-link">términos de uso</Link> y el <Link href="/privacidad" target="_blank" className="auth-link">aviso de privacidad</Link>.</span>
        </label>
        <Turnstile ref={turnstile} action="register" onToken={setCaptcha} />
        <SubmitButton loading={loading} disabled={!!TURNSTILE_SITE_KEY && !captcha}>{TURNSTILE_SITE_KEY && !captcha ? 'Verificando…' : 'Crear cuenta gratis'}</SubmitButton>
      </form>
      <p className="auth-alt">¿Ya tienes cuenta? <Link href="/login" className="auth-link strong">Inicia sesión</Link></p>
      <p className="auth-fine">¿Te invitaron a una tienda? Regístrate con el correo al que te invitaron y después abre el enlace de tu invitación para unirte.</p>
    </>
  )
}
