'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type SignupConfig = {
  appId: string
  configId: string
  graphVersion: string
  configured: boolean
  missing: string[]
  webhookUrl: string
  webhookVerifyTokenConfigured: boolean
}

type SessionData = {
  wabaId?: string
  phoneNumberId?: string
  businessId?: string
}

type TokenResult = {
  accessToken: string
  tokenType: string
  expiresIn: number | null
}

type FacebookLoginResponse = {
  authResponse?: { code?: string }
}

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>
  ) => void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

const fieldStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9,
  background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' as const,
}

function ValueField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '.07em' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input readOnly value={value} type={secret ? 'password' : 'text'} style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
        <button className="btn btn-ghost" onClick={copy} type="button">{copied ? 'Copiado' : 'Copiar'}</button>
      </div>
    </div>
  )
}

export default function WhatsAppSetupSection() {
  const [config, setConfig] = useState<SignupConfig | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<SessionData>({})
  const [token, setToken] = useState<TokenResult | null>(null)
  const attemptRef = useRef(0)
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurListenerRef = useRef<(() => void) | null>(null)

  const clearPopupWatch = useCallback(() => {
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current)
    if (blurListenerRef.current) window.removeEventListener('blur', blurListenerRef.current)
    popupTimerRef.current = null
    blurListenerRef.current = null
  }, [])

  useEffect(() => () => {
    attemptRef.current++
    clearPopupWatch()
  }, [clearPopupWatch])

  useEffect(() => {
    fetch('/api/whatsapp/embedded-signup', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'No se pudo leer la configuracion')
        setConfig(data)
      })
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => {
    if (!config?.appId) return

    const init = () => {
      if (!window.FB) return
      window.FB.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: config.graphVersion,
      })
      setSdkReady(true)
    }

    window.fbAsyncInit = init
    if (window.FB) {
      init()
      return
    }

    const existing = document.getElementById('facebook-jssdk')
    if (existing) return
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = 'https://connect.facebook.net/es_MX/sdk.js'
    script.onerror = () => setError('No se pudo cargar el SDK de Meta')
    document.body.appendChild(script)
  }, [config])

  useEffect(() => {
    const receiveMessage = (event: MessageEvent) => {
      if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return

      let message: any
      try {
        message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (message?.type !== 'WA_EMBEDDED_SIGNUP') return

      if (message.event === 'FINISH' || message.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        const data = message.data ?? {}
        setSession({
          wabaId: data.waba_id || data.wabaId,
          phoneNumberId: data.phone_number_id || data.phoneNumberId,
          businessId: data.business_id || data.businessId,
        })
      } else if (message.event === 'CANCEL') {
        clearPopupWatch()
        attemptRef.current++
        setWorking(false)
        setError('El proceso se cancelo antes de terminar')
      } else if (message.event === 'ERROR') {
        clearPopupWatch()
        attemptRef.current++
        setWorking(false)
        setError(message.data?.error_message || 'Meta devolvio un error durante la conexion')
      }
    }

    window.addEventListener('message', receiveMessage)
    return () => window.removeEventListener('message', receiveMessage)
  }, [clearPopupWatch])

  const exchangeCode = useCallback(async (code: string) => {
    const response = await fetch('/api/whatsapp/embedded-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'No se pudo obtener el token')
    setToken(data)
  }, [])

  const connect = () => {
    setError('')
    setToken(null)
    setSession({})

    if (!config?.configured || !window.FB) {
      setError('Completa las variables de Meta y vuelve a cargar esta pagina')
      return
    }

    clearPopupWatch()
    const attempt = ++attemptRef.current
    let popupOpened = false
    const markPopupOpen = () => { popupOpened = true }
    blurListenerRef.current = markPopupOpen
    window.addEventListener('blur', markPopupOpen)
    popupTimerRef.current = setTimeout(() => {
      clearPopupWatch()
      if (!popupOpened && attemptRef.current === attempt) {
        setWorking(false)
        setError('No se abrio la ventana de Meta. Permite las ventanas emergentes para ipesa-prospection.vercel.app e intentalo de nuevo.')
      }
    }, 8000)

    setWorking(true)
    // Debe ejecutarse directamente dentro del clic para que el navegador no bloquee el popup.
    try {
      window.FB.login(response => {
        clearPopupWatch()
        if (attemptRef.current !== attempt) return
        const code = response.authResponse?.code
        if (!code) {
          setWorking(false)
          setError('Meta no devolvio un codigo de autorizacion. Revisa la ventana emergente y vuelve a intentarlo.')
          return
        }
        void exchangeCode(code)
          .catch(err => {
            setError(err instanceof Error ? err.message : 'No se pudo terminar la conexion')
          })
          .finally(() => setWorking(false))
      }, {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      })
    } catch (err) {
      clearPopupWatch()
      attemptRef.current++
      setWorking(false)
      setError(err instanceof Error ? err.message : 'No se pudo abrir el registro de Meta')
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: '#DCF5E3', color: '#1B9E4B', display: 'grid', placeItems: 'center', fontSize: 20 }}>◉</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Conectar WhatsApp Business</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>Coexistencia: conserva la app del telefono y habilita Cloud API</div>
        </div>
      </div>

      <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          <div>1. Ten el telefono principal a la mano y WhatsApp Business actualizado.</div>
          <div>2. Permite ventanas emergentes y completa el flujo de Meta.</div>
          <div>3. Escanea el QR desde la app cuando Meta lo solicite.</div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={connect}
          disabled={!config?.configured || !sdkReady || working}
          style={{ marginTop: 16 }}
        >
          {working ? 'Terminando conexion…' : !config ? 'Cargando…' : !config.configured ? 'Configuracion incompleta' : !sdkReady ? 'Cargando Meta…' : 'Conectar WhatsApp'}
        </button>
        {config && config.missing.length > 0 && (
          <div style={{ marginTop: 12, color: 'var(--ipesa-rose)', fontSize: 12.5, lineHeight: 1.5 }}>
            Faltan en el despliegue de Vercel: {config.missing.join(', ')}. Comprueba el entorno Production y vuelve a desplegar.
          </div>
        )}
      </div>

      {config && (
        <div style={{ padding: 14, borderRadius: 10, background: 'var(--paper)', marginBottom: 16, fontSize: 12.5, lineHeight: 1.55 }}>
          <strong>Webhook para Meta:</strong> {config.webhookUrl}<br />
          <span style={{ color: config.webhookVerifyTokenConfigured ? 'var(--ipesa-green)' : 'var(--ipesa-rose)' }}>
            {config.webhookVerifyTokenConfigured ? 'Token de verificacion configurado' : 'Falta WHATSAPP_WEBHOOK_VERIFY_TOKEN'}
          </span>
        </div>
      )}

      {error && <div style={{ padding: 12, borderRadius: 9, background: 'var(--ipesa-rose-soft)', color: 'var(--ipesa-rose)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {token && (
        <div style={{ display: 'grid', gap: 14, padding: 18, border: '1px solid #BFE3C9', borderRadius: 12, background: '#F3FBF5' }}>
          <div style={{ color: 'var(--ipesa-green)', fontWeight: 700 }}>Conexion autorizada por Meta</div>
          <div style={{ color: 'var(--ink-2)', fontSize: 12.5, lineHeight: 1.5 }}>
            Copia estos valores ahora al entorno seguro del servidor. El token no se conserva en el navegador al recargar.
          </div>
          {session.wabaId && <ValueField label="WHATSAPP_WABA_ID" value={session.wabaId} />}
          {session.phoneNumberId && <ValueField label="WHATSAPP_PHONE_NUMBER_ID" value={session.phoneNumberId} />}
          {session.businessId && <ValueField label="META_BUSINESS_ID" value={session.businessId} />}
          <ValueField label="WHATSAPP_ACCESS_TOKEN" value={token.accessToken} secret />
          {token.expiresIn && <div style={{ fontSize: 12, color: 'var(--muted)' }}>El token reporta una vigencia de {token.expiresIn} segundos.</div>}
          {!session.wabaId && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Meta no incluyo los IDs en el evento del navegador. Puedes encontrarlos en WhatsApp Manager; el token ya se genero correctamente.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
