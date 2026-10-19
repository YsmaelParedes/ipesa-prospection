import type { Metadata } from 'next'
import Link from 'next/link'
import { APP_NAME } from '@/lib/brand'
import { CtaBand, Ic, PageHero, SectionHead } from '../_ui'
import s from '../inicio.module.css'

export const metadata: Metadata = {
  title: `WhatsApp en tu CRM · ${APP_NAME}`,
  description: 'Atiende el WhatsApp de tu tienda desde el CRM, con cada chat ligado a su cliente y su cotización. Incluido en el plan Cubeta.',
}

const POINTS = [
  { icon: Ic.chat, tone: s.tWa, title: 'Una bandeja para todo el equipo', text: 'Los chats del número de tu tienda en el CRM, sin pasarse el celular.' },
  { icon: Ic.link, tone: s.tBrand, title: 'Cada chat con su cliente', text: 'Mientras respondes ves su historial, sus cotizaciones y su siguiente paso.' },
  { icon: Ic.megaphone, tone: s.tMagenta, title: 'Respuestas rápidas', text: 'Respuestas guardadas para lo que más te preguntan y plantillas aprobadas por Meta para retomar una conversación.' },
  { icon: Ic.shield, tone: s.tCyan, title: 'Con las reglas oficiales de Meta', text: 'Respeta la ventana de atención y las esperas que pide Meta, para cuidar tu número.' },
]

const STEPS = [
  { title: 'Elige el plan Cubeta', text: 'Desde tu CRM, y luego tocas "Quiero activarlo".' },
  { title: 'Un asesor lo configura', text: 'Lo conecta con el número de tu tienda. Tú no haces nada técnico.' },
  { title: 'Empiezas a atender', text: 'Tus chats aparecen en el CRM y tu equipo responde desde ahí.' },
]

export default function WhatsAppPage() {
  return (
    <>
      <PageHero
        kicker="Plan Cubeta"
        title={<>Atiende y vende por <span className={s.waText}>WhatsApp</span> desde tu CRM</>}
        lead="El WhatsApp de tu tienda, conectado a tus clientes y cotizaciones. Lo dejamos listo por ti con el número de tu tienda."
      >
        <div className={s.heroCtas}>
          <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>Quiero WhatsApp en mi tienda <Ic.arrow className={s.btnArrow} /></Link>
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
            <span className={s.kicker}>Bandeja de WhatsApp</span>
            <h2 className={s.h2}>Cada conversación, conectada con su venta</h2>
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
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead kicker="Cómo se activa" title="Tú lo pides, nosotros lo dejamos listo" sub="Sin formularios técnicos ni configuraciones: un asesor conecta el número de tu tienda." />
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.stepCard}>
                <span className={`${s.stepNum} ${s[`n${i + 1}`]}`}>{i + 1}</span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
          <p className={s.finePrint}>
            Incluido en el plan Cubeta. WhatsApp Business Platform es de Meta y está sujeto a sus
            políticas; Meta puede cobrar por los mensajes según sus tarifas vigentes.
          </p>
        </div>
      </section>

      <CtaBand title="Atiende WhatsApp desde tu CRM" text="Crea tu cuenta, cambia al plan Cubeta y lo configuramos con el número de tu tienda." />
    </>
  )
}
