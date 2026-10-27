import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import Link from 'next/link'
import { APP_NAME } from '@/lib/brand'
import { EMAILS } from '@/lib/legal'
import { CtaBand, Ic, PageHero } from '../_ui'
import s from '../inicio.module.css'

/*
 * WhatsApp y el agente de IA están en desarrollo (ver WHATSAPP_OFFERED en lib/stores.ts):
 * esta página solo los anuncia, sin demo ni forma de pedirlos. /inicio/agente-ia redirige aquí.
 */
export const metadata: Metadata = pageMeta({
  title: `WhatsApp y agente de IA, próximamente · ${APP_NAME}`,
  description: 'Muy pronto podrás atender el WhatsApp de tu tienda desde Matices, con un agente de IA que contesta por ti. Escríbenos y te avisamos cuando esté listo.',
  path: '/inicio/whatsapp',
})

const NOTIFY = `mailto:${EMAILS.hola}?subject=${encodeURIComponent('Avísenme cuando WhatsApp esté listo')}`

const POINTS = [
  { icon: Ic.chat, tone: s.tWa, title: 'Una bandeja para todo el equipo', text: 'Los chats del número de tu tienda en el CRM, sin pasarse el celular.' },
  { icon: Ic.link, tone: s.tBrand, title: 'Cada chat con su cliente', text: 'Mientras respondes ves su historial, sus cotizaciones y su siguiente paso.' },
  { icon: Ic.layers, tone: s.tMagenta, title: 'Un agente de IA que contesta por ti', text: 'Responde a cualquier hora con la información de tu tienda y pasa el chat a tu equipo cuando hace falta.' },
  { icon: Ic.store, tone: s.tCyan, title: 'Lo conectas tú, en unos clics', text: 'Vinculas el número de tu tienda desde tu CRM, sin trámites técnicos.' },
]

export default function WhatsAppPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('WhatsApp y agente de IA', '/inicio/whatsapp')} />
      <PageHero
        title={<><span className={s.waText}>WhatsApp</span> y un agente de IA, <span className={s.spectrumText}>muy pronto</span></>}
        lead="Estamos terminando la conexión para que vincules el WhatsApp de tu tienda tú mismo. Mientras, ordena tus ventas con el Sistema Comercial y tus Contactos."
      >
        <div className={s.heroCtas}>
          <a href={NOTIFY} className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>Avísenme cuando esté listo <Ic.arrow className={s.btnArrow} /></a>
          <Link href="/registro" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Crear cuenta gratis</Link>
        </div>
      </PageHero>

      <section className={s.section}>
        <div className={`${s.wrap} ${s.split}`}>
          <div className={s.waMock} aria-hidden="true">
            <div className={s.waList}>
              <div className={s.waListHead}><Ic.chat />Conversaciones</div>
              {[
                ['KL', 'Karen López', '¿Tienen vinílica blanca en cubeta?', '10:24', 2, true],
                ['CR', 'Constructora Ríos', 'Gracias, paso hoy por la cotización', '9:58', 0, false],
                ['AS', 'Arq. Andrea Solís', '¿Me pueden igualar este color?', 'Ayer', 1, false],
              ].map(([ini, name, msg, time, unread, on]) => (
                <div key={name as string} className={`${s.waConv} ${on ? s.waConvOn : ''}`}>
                  <span className={`${s.av} ${s.avBrand}`}>{ini}</span>
                  <span className={s.rowName}>{name}<small>{msg}</small></span>
                  <span className={s.waMeta}><small>{time}</small>{(unread as number) > 0 && <b>{unread}</b>}</span>
                </div>
              ))}
            </div>
            <div className={s.waChat}>
              <div className={s.waChatHead}><strong>Karen López</strong><span className={s.waLinked}><Ic.link />Cotización · $4,850</span></div>
              <p className={s.msgIn}>Hola, ¿tienen vinílica blanca en cubeta?</p>
              <p className={s.msgOut}>¡Hola Karen! Sí, tenemos de 19 L. Te mando tu cotización.<span className={s.ticks}>✓✓</span></p>
              <p className={s.msgIn}>Perfecto, gracias 🙌</p>
            </div>
          </div>
          <div>
            <h2 className={s.h2}>Lo que viene</h2>
            <div className={s.pointList}>
              {POINTS.map(p => (
                <div key={p.title} className={s.point}>
                  <span className={`${s.featureIcon} ${p.tone}`}><p.icon /></span>
                  <div><h3>{p.title}</h3><p>{p.text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className={s.finePrint}>
          Estará incluido en el plan Cubeta. WhatsApp Business Platform es de Meta y está sujeto a sus
          políticas; Meta puede cobrar por los mensajes según sus tarifas vigentes.
        </p>
      </section>

      <CtaBand />
    </>
  )
}
