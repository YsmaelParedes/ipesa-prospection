'use client'

import { useLockSeen, useUpgradeDialog } from '@/components/UpgradeDialog'
import { Avatar } from '@/components/CrmUI'
import { WaIcon } from '@/components/WhatsAppUI'
import { useSession } from '@/lib/profile'
import { WhatsAppConnect } from '@/components/WhatsAppConnect'

const BENEFITS = [
  { icon: <WaIcon.chat size={18} />,      title: 'Todos los chats en un solo lugar', text: 'Tu equipo atiende el WhatsApp de la tienda desde el CRM, sin pasarse el celular.' },
  { icon: <WaIcon.megaphone size={18} />, title: 'Responde rápido',                  text: 'Respuestas guardadas y plantillas aprobadas para retomar conversaciones.' },
  { icon: <WaIcon.user size={18} />,      title: 'Cada chat ligado a su cliente',     text: 'Ves su historial y sus cotizaciones mientras le respondes.' },
]

const STEPS = [
  { title: 'Cambia a Cubeta',       text: 'WhatsApp viene incluido en ese plan.' },
  { title: 'Conectas tu número',    text: 'Desde Configuración, en unos clics y sin trámites técnicos.' },
  { title: 'Empiezas a atender',    text: 'Tus chats aparecen aquí mismo.' },
]

// Conversaciones de ejemplo para la vista previa (no son datos reales)
const SAMPLE = [
  { name: 'Juan Pérez',  text: '¿Tienen vinílica blanca en cubeta?', time: '10:24', unread: 2 },
  { name: 'Ana López',   text: 'Gracias, paso hoy por la cotización',  time: '9:58',  unread: 0 },
  { name: 'Carlos Ruiz', text: '¿Me pueden igualar este color?',       time: 'Ayer',  unread: 1 },
]

/**
 * WhatsApp en una tienda que aún no lo tiene conectado. Viene en el plan
 * Cubeta: el administrador conecta su número él mismo en unos clics
 * (WhatsAppConnect). En Litro se ofrece Cubeta (el botón abre el aviso con el
 * pago); quien no es administrador espera a que alguien lo conecte.
 */
export function WhatsAppOffer() {
  const session = useSession()
  const upgrade = useUpgradeDialog()
  const store = session?.store
  const canRequest = !!session?.isAdmin
  const inPlan = !!store?.planIncludesWhatsApp
  useLockSeen(canRequest && store && !inPlan ? 'whatsapp' : null)

  // Alta en unos clics: el administrador conecta el número él mismo
  if (store?.whatsappSignup && inPlan && canRequest) return <WhatsAppConnect />

  if (!canRequest) {
    return (
      <div className="wa-card wa-empty">
        <span className="wa-empty-icon"><WaIcon.whatsapp size={34} /></span>
        <div className="wa-empty-title">WhatsApp aún no está conectado en tu tienda</div>
        <div>Cuando un administrador conecte el número de la tienda, aquí verás los chats de tus clientes.</div>
      </div>
    )
  }

  return (
    <div className="wa-offer">
      <section className="wa-offer-hero">
        <div className="wa-offer-copy">
          <span className="wa-offer-status"><i />Incluido en el plan Cubeta</span>
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
          <button type="button" className="btn btn-primary wa-offer-btn" onClick={() => upgrade.open('whatsapp')}><WaIcon.whatsapp size={17} /> Cambiar a Cubeta</button>
          <span className="wa-offer-note">Responderle a tus clientes no cuesta; si les escribes tú primero con plantillas, Meta cobra aparte.</span>
        </div>
      </section>
      {upgrade.dialog}
    </div>
  )
}
