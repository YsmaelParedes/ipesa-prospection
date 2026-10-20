'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * Widget de Cloudflare Turnstile para los formularios de acceso. Casi siempre
 * se resuelve solo; si Cloudflare duda, muestra una casilla. Entrega el token
 * con onToken y se reinicia con ref.reset() (cada token sirve una sola vez).
 * Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY no muestra nada y onToken recibe ''.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global { interface Window { turnstile?: TurnstileApi } }

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loading: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { loading = null; reject(new Error('turnstile')) }
      document.head.appendChild(s)
    })
  }
  return loading
}

export type TurnstileHandle = { reset: () => void }

export const Turnstile = forwardRef<TurnstileHandle, { action: 'login' | 'register' | 'recover'; onToken: (token: string) => void }>(
  function Turnstile({ action, onToken }, ref) {
    const box = useRef<HTMLDivElement>(null)
    const widget = useRef<string | null>(null)
    const cb = useRef(onToken)
    cb.current = onToken
    const [failed, setFailed] = useState(false)

    useImperativeHandle(ref, () => ({
      reset: () => {
        cb.current('')
        if (widget.current && window.turnstile) window.turnstile.reset(widget.current)
      },
    }), [])

    useEffect(() => {
      if (!TURNSTILE_SITE_KEY) return
      let alive = true
      loadScript().then(() => {
        if (!alive || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          language: 'es',
          appearance: 'interaction-only',
          callback: (t: string) => { setFailed(false); cb.current(t) },
          'expired-callback': () => cb.current(''),
          'error-callback': () => { cb.current(''); setFailed(true) },
        })
      }).catch(() => { if (alive) setFailed(true) })
      return () => {
        alive = false
        if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
        widget.current = null
      }
    }, [action])

    if (!TURNSTILE_SITE_KEY) return null
    return (
      <div className="auth-turnstile">
        <div ref={box} />
        {failed && (
          <div className="auth-hint" role="alert">
            No se pudo cargar la verificación de seguridad. Revisa tu conexión y recarga la página.
          </div>
        )}
      </div>
    )
  },
)
