'use client'

import { apiFetch } from '@/lib/apiClient'


import { useState } from 'react'
import Link from '@/components/CachedLink'
import { Avatar } from '@/components/CrmUI'
import { WaIcon } from '@/components/WhatsAppUI'
import { invalidateSession, useSession } from '@/lib/profile'
import { WHATSAPP_OFFERED } from '@/lib/stores'

const BENEFITS = [
  { icon: <WaIcon.chat size={18} />,      title: 'Todos los chats en un solo lugar', text: 'Tu equipo atiende el WhatsApp de la tienda desde el CRM, sin pasarse el celular.' },
  { icon: <WaIcon.megaphone size={18} />, title: 'Responde rápido',                  text: 'Respuestas guardadas y plantillas aprobadas para retomar conversaciones.' },
  { icon: <WaIcon.user size={18} />,      title: 'Cada chat ligado a su cliente',     text: 'Ves su historial y sus cotizaciones mientras le respondes.' },
]

const STEPS = [
  { title: 'Lo solicitas',        text: 'Con el botón de abajo (incluido en el plan Cubeta).' },
  { title: 'Un asesor lo configura', text: 'Lo conecta con el número de tu tienda. Tú no haces nada técnico.' },
  { title: 'Empiezas a atender',   text: 'Tus chats aparecen aquí mismo.' },
]

// Conversaciones de ejemplo para la vista previa (no son datos reales)
const SAMPLE = [
  { name: 'Juan Pérez',  text: '¿Tienen vinílica blanca en cubeta?', time: '10:24', unread: 2 },
  { name: 'Ana López',   text: 'Gracias, paso hoy por la cotización',  time: '9:58',  unread: 0 },
  { name: 'Carlos Ruiz', text: '¿Me pueden igualar este color?',       time: 'Ayer',  unread: 1 },
]

/**
 * WhatsApp "Por activar": presentación del servicio para una tienda que aún
 * no lo tiene. Mientras WHATSAPP_OFFERED sea false se presenta como
 * "Próximamente" y no se puede pedir. Viene en el plan Cubeta: en Litro y Galón se ofrece cambiar de
 * plan; en Cubeta un administrador lo solicita, llega un correo a la
 * plataforma y un asesor conecta el número (la tienda no puede activarlo).
 */
export function WhatsAppOffer() {
  const session = useSession()
  const store = session?.store
  const canRequest = !!session?.isAdmin
  const inPlan = !!store?.planIncludesWhatsApp
  const [requestedAt, setRequestedAt] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const requested = requestedAt ?? store?.whatsappRequestedAt ?? null

  const request = async () => {
    setSending(true); setError('')
    try {
      const r = await apiFetch('/api/store/whatsapp-request', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo enviar la solicitud. Intenta de nuevo.'); return }
      setRequestedAt(d.requestedAt ?? new Date().toISOString())
      invalidateSession()
    } catch {
      setError('Error de red. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  if (!WHATSAPP_OFFERED) {
    return (
      <div className="wa-offer">
        <section className="wa-offer-hero">
          <div className="wa-offer-copy">
            <span className="wa-offer-status"><i />Próximamente</span>
            <h2>WhatsApp y un agente de IA, muy pronto en tu CRM</h2>
            <ul className="wa-offer-benefits">
              {BENEFITS.map(b => (
                <li key={b.title}>
                  <span className="wa-offer-ico">{b.icon}</span>
                  <span><strong>{b.title}</strong>{b.text}</span>
                </li>
              ))}
            </ul>
            <p className="wa-offer-note">Estamos terminando la conexión para que vincules el WhatsApp de tu tienda tú mismo, en unos clics. Te avisaremos cuando esté lista.</p>
          </div>
          <div className="wa-offer-preview" aria-hidden="true">
            <div className="wa-offer-preview-head"><WaIcon.whatsapp size={16} /> Conversaciones</div>
            {SAMPLE.map(c => (
              <div className="wa-conv" key={c.name}>
                <Avatar name={c.name} size={36} />
                <span className="wa-conv-main">
                  <span className="wa-conv-top"><span className="wa-conv-name">{c.name}</span><span className="wa-conv-time">{c.time}</span></span>
                  <span className="wa-conv-bottom"><span className="wa-conv-preview"><span className="wa-ellipsis">{c.text}</span></span></span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  if (!canRequest) {
    return (
      <div className="wa-card wa-empty">
        <span className="wa-empty-icon"><WaIcon.whatsapp size={34} /></span>
        <div className="wa-empty-title">WhatsApp aún no está activo en tu tienda</div>
        <div>Cuando un administrador de la tienda lo active, aquí verás los chats de tus clientes.</div>
      </div>
    )
  }

  return (
    <div className="wa-offer">
      <section className="wa-offer-hero">
        <div className="wa-offer-copy">
          <span className="wa-offer-status"><i />{inPlan ? 'Aún no está configurado' : 'Incluido en el plan Cubeta'}</span>
          <h2>Atiende y vende por WhatsApp desde tu CRM</h2>
          <ul className="wa-offer-benefits">
            {BENEFITS.map(b => (
              <li key={b.title}>
                <span className="wa-offer-ico">{b.icon}</span>
                <span><strong>{b.title}</strong>{b.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Vista previa decorativa de la bandeja */}
        <div className="wa-offer-preview" aria-hidden="true">
          <div className="wa-offer-preview-head"><WaIcon.whatsapp size={16} /> Conversaciones</div>
          {SAMPLE.map(c => (
            <div className="wa-conv" key={c.name}>
              <Avatar name={c.name} size={36} />
              <span className="wa-conv-main">
                <span className="wa-conv-top">
                  <span className="wa-conv-name">{c.name}</span>
                  <span className={`wa-conv-time ${c.unread ? 'unread' : ''}`}>{c.time}</span>
                </span>
                <span className="wa-conv-bottom">
                  <span className="wa-conv-preview"><span className="wa-ellipsis">{c.text}</span></span>
                  {c.unread > 0 && <span className="wa-unread">{c.unread}</span>}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="wa-offer-steps">
        <h3>¿Cómo se activa?</h3>
        <ol>
          {STEPS.map((st, i) => (
            <li key={st.title}>
              <span className="wa-offer-num">{i + 1}</span>
              <span><strong>{st.title}</strong>{st.text}</span>
            </li>
          ))}
        </ol>

        <div className="wa-offer-foot">
          {!inPlan ? (
            <>
              {session?.isAdmin
                ? <Link href="/configuracion?tab=plan" className="btn btn-primary wa-offer-btn"><WaIcon.whatsapp size={17} /> Cambiar a Cubeta</Link>
                : <span className="wa-offer-note">Pídele a un administrador de la tienda que cambie al plan Cubeta.</span>}
              <span className="wa-offer-note">WhatsApp viene en el plan Cubeta; al cambiar, un asesor conecta el número de tu tienda.</span>
            </>
          ) : requested ? (
            <div className="wa-offer-done" role="status">
              <WaIcon.check size={18} />
              <span><strong>Solicitud enviada</strong>Un asesor te contactará pronto para dejarlo listo.</span>
            </div>
          ) : (
            <>
              <button className="btn btn-primary wa-offer-btn" onClick={request} disabled={sending}>
                <WaIcon.whatsapp size={17} /> {sending ? 'Enviando…' : 'Quiero activarlo'}
              </button>
              <span className="wa-offer-note">Incluido en tu plan Cubeta. Un asesor conecta el número de tu tienda.</span>
            </>
          )}
          {error && <div className="wa-form-error">{error}</div>}
        </div>
      </section>
    </div>
  )
}
