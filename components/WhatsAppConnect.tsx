'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/apiClient'
import { WaIcon } from '@/components/WhatsAppUI'
import { invalidateSession } from '@/lib/profile'
import { readSessionInfo, signupExtras, type SessionInfo, type SignupMode as Mode } from '@/lib/whatsappSignupParse'

type Config = { appId: string; configId: string; version: string }
type Pending = { wabaId: string; phoneNumberId: string | null; coexistence: boolean }
type Setup = { open: boolean; config: Config | null; pending: Pending | null }
type Phase = 'idle' | 'meta' | 'finishing' | 'cancelled' | 'error'

declare global {
  interface Window {
    FB?: {
      init(o: Record<string, unknown>): void
      login(cb: (r: { authResponse?: { code?: string } | null }) => void, o: Record<string, unknown>): void
    }
    fbAsyncInit?: () => void
  }
}

const SDK_ID = 'facebook-jssdk'

/** Carga el SDK de Meta una sola vez; resuelve cuando FB.init ya corrió. */
function loadSdk(config: Config): Promise<void> {
  if (window.FB) return Promise.resolve()
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: config.appId, autoLogAppEvents: false, xfbml: false, version: config.version })
      resolve()
    }
    if (document.getElementById(SDK_ID)) return
    const s = document.createElement('script')
    s.id = SDK_ID
    s.src = 'https://connect.facebook.net/es_LA/sdk.js'
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
    s.onerror = () => reject(new Error('sdk'))
    document.body.appendChild(s)
  })
}

const MODES: { id: Mode; title: string; text: string }[] = [
  { id: 'app', title: 'Ya uso WhatsApp Business', text: 'Lo sigues usando en tu celular y traemos tus chats de los últimos 6 meses.' },
  { id: 'new', title: 'Es un número nuevo', text: 'Sin WhatsApp, o que ya borraste de la app. Te llega un código por SMS o llamada.' },
]

const STEPS: Record<Mode, { title: string; text: string }[]> = {
  app: [
    { title: 'Toca «Conectar con WhatsApp»', text: 'Se abre una ventana de Meta, la empresa de WhatsApp.' },
    { title: 'Entra con tu Facebook y elige tu negocio', text: 'Si no tienes uno, ahí mismo lo creas.' },
    { title: 'Confirma desde tu celular', text: 'Escribe tu número, abre WhatsApp Business y sigue los pasos que te muestra. Acepta compartir tus chats para traerlos.' },
  ],
  new: [
    { title: 'Toca «Conectar con WhatsApp»', text: 'Se abre una ventana de Meta, la empresa de WhatsApp.' },
    { title: 'Entra con tu Facebook y elige tu negocio', text: 'Si no tienes uno, ahí mismo lo creas.' },
    { title: 'Escribe el número de tu tienda', text: 'Te llega un código por SMS o llamada a ese número; escríbelo en la ventana.' },
  ],
}

/**
 * Alta de WhatsApp en unos clics (Embedded Signup): abre la ventana de Meta,
 * espera el código y los ids de la cuenta, y el servidor termina la conexión
 * (ver lib/whatsappSignup.ts). Si algo falla después de Meta, «Intentar otra
 * vez» retoma sin volver a abrir la ventana.
 */
export function WhatsAppConnect() {
  const router = useRouter()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [coexistence, setCoexistence] = useState(false)
  const [mode, setMode] = useState<Mode>('app')
  const info = useRef<SessionInfo | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch('/api/store/whatsapp/connect').then(r => r.json()).then((d: Setup) => {
      if (!alive) return
      setSetup(d)
      if (d.config) loadSdk(d.config).then(() => alive && setSdkReady(true)).catch(() => alive && setError('No se pudo abrir la conexión con Meta. Revisa tu internet o desactiva el bloqueador de anuncios e intenta otra vez.'))
    }).catch(() => alive && setError('Error de red. Revisa tu conexión e intenta otra vez.'))
    return () => { alive = false }
  }, [])

  // Aviso de la ventana de Meta: solo se cree si viene de facebook.com
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      let host = ''
      try { host = new URL(e.origin).hostname } catch { return }
      if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return
      const parsed = readSessionInfo(e.data)
      if (parsed === 'cancel') info.current = null
      else if (parsed) info.current = parsed
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const finish = useCallback(async (body: Record<string, unknown>) => {
    setPhase('finishing'); setError('')
    setCoexistence(body.coexistence === true)
    try {
      const r = await apiFetch('/api/store/whatsapp/connect', { method: 'POST', body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(d.error || 'No se pudo conectar tu WhatsApp. Intenta otra vez.')
        setPhase('error')
        // Lo que sí se guardó permite retomar sin volver a Meta
        apiFetch('/api/store/whatsapp/connect').then(x => x.json()).then(setSetup).catch(() => {})
        return
      }
      invalidateSession()
      router.replace('/configuracion?tab=whatsapp&conectado=1', { scroll: false })
    } catch {
      setError('Error de red. Revisa tu conexión e intenta otra vez.')
      setPhase('error')
    }
  }, [router])

  // Debe llamarse directo desde el clic: si no, el navegador bloquea la ventana
  const openMeta = () => {
    const config = setup?.config
    if (!config || !window.FB) return
    info.current = null
    setError(''); setPhase('meta')
    window.FB.login(response => {
      const code = response?.authResponse?.code
      if (!code) { setPhase('cancelled'); return }
      // El aviso con la cuenta puede llegar justo después del código
      const started = Date.now()
      const wait = () => {
        const i = info.current
        if (i) { void finish({ code, ...i }); return }
        if (Date.now() - started > 4000) { setError('Meta no nos dijo qué cuenta elegiste. Vuelve a intentarlo.'); setPhase('error'); return }
        setTimeout(wait, 150)
      }
      wait()
    }, {
      config_id: config.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: signupExtras(mode),
    })
  }

  const resume = () => {
    const p = setup?.pending
    if (p) void finish({ wabaId: p.wabaId, phoneNumberId: p.phoneNumberId, coexistence: p.coexistence })
  }

  if (phase === 'finishing') return <Finishing coexistence={coexistence} />

  const unavailable = setup && (!setup.open || !setup.config)
  const pending = setup?.pending ?? null

  return (
    <div className="wa-offer">
      <section className="wa-offer-hero wa-connect-hero">
        <div className="wa-offer-copy">
          <span className="wa-offer-status"><i />Incluido en tu plan Cubeta</span>
          <h2>Conecta el WhatsApp de tu tienda</h2>
          <p className="wa-connect-lead">Tus clientes te siguen escribiendo al número de siempre y tu equipo les responde desde Matices.</p>
          <ul className="wa-offer-benefits">
            <li><span className="wa-offer-ico"><WaIcon.chat size={18} /></span><span><strong>Todos los chats en un solo lugar</strong>Tu equipo atiende sin pasarse el celular.</span></li>
            <li><span className="wa-offer-ico"><WaIcon.phone size={18} /></span><span><strong>Sigues usando tu celular</strong>Si ya tienes WhatsApp Business, los chats llegan a los dos lados.</span></li>
            <li><span className="wa-offer-ico"><WaIcon.clock size={18} /></span><span><strong>Traemos tus últimos 6 meses</strong>Tus conversaciones anteriores aparecen en la bandeja.</span></li>
          </ul>
        </div>

        <div className="wa-connect-steps">
          <h3>Así se conecta <small>· unos 5 minutos</small></h3>
          <fieldset className="wa-connect-choice" disabled={phase === 'meta'}>
            <legend>¿El número de tu tienda ya tiene WhatsApp Business?</legend>
            {MODES.map(m => (
              <label key={m.id} className="wa-connect-option">
                <input type="radio" name="wa-connect-mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
                <span className="wa-connect-radio" aria-hidden="true" />
                <span><strong>{m.title}</strong>{m.text}</span>
              </label>
            ))}
          </fieldset>
          <ol>
            {STEPS[mode].map((st, i) => (
              <li key={st.title}><span className="wa-offer-num">{i + 1}</span><span><strong>{st.title}</strong>{st.text}</span></li>
            ))}
            <li><span className="wa-offer-num wa-connect-ok"><WaIcon.check size={14} /></span><span><strong>Listo</strong>Tus chats empiezan a llegar a Matices.</span></li>
          </ol>

          <div className="wa-connect-foot">
            {phase === 'cancelled' && (
              <p className="wa-connect-msg" role="status">No terminaste la conexión. No se guardó nada; puedes intentarlo cuando quieras.</p>
            )}
            {error && <p className="wa-connect-msg wa-connect-err" role="alert">{error}</p>}
            {pending ? (
              <>
                <p className="wa-connect-msg" role="status">Tu conexión con Meta quedó a medias. Termínala sin volver a pasar por Meta.</p>
                <button type="button" className="btn btn-primary wa-connect-btn" onClick={resume}>Terminar la conexión</button>
                <button type="button" className="wa-connect-link" onClick={openMeta} disabled={!sdkReady}>Empezar otra vez en Meta</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary wa-connect-btn" onClick={openMeta}
                disabled={!sdkReady || !!unavailable || phase === 'meta'}>
                <WaIcon.whatsapp size={18} />
                {phase === 'meta' ? 'Termina en la ventana de Meta…' : !setup || (!sdkReady && !unavailable && !error) ? 'Preparando…' : phase === 'error' ? 'Intentar otra vez' : 'Conectar con WhatsApp'}
              </button>
            )}
            {unavailable && <p className="wa-connect-msg">Conectar WhatsApp estará disponible muy pronto.</p>}
            <p className="wa-connect-note">Ten a la mano tu Facebook y el celular con el número. Responderle a tus clientes no cuesta; si les escribes tú primero con plantillas, Meta te cobra aparte. Te recomendamos hacerlo en computadora.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function Finishing({ coexistence }: { coexistence: boolean }) {
  return (
    <div className="wa-offer">
      <section className="wa-connect-finishing" role="status" aria-live="polite">
        <span className="wa-offer-ico wa-connect-big"><WaIcon.whatsapp size={26} /></span>
        <h2>Terminando la conexión…</h2>
        <p>No cierres esta pestaña. Tarda menos de un minuto.</p>
        <ol>
          <li><span className="wa-connect-dot done"><WaIcon.check size={12} /></span>Cuenta de WhatsApp vinculada en Meta</li>
          <li className="now"><span className="wa-connect-dot spin" />Activando tu número y la recepción de mensajes</li>
          {coexistence && <li><span className="wa-connect-dot" />Pidiendo tus chats de los últimos 6 meses</li>}
        </ol>
        {coexistence && <p className="wa-connect-info">Tu número ya funcionaba con WhatsApp Business: lo sigues usando en el celular y los chats llegan a los dos lados.</p>}
      </section>
    </div>
  )
}
