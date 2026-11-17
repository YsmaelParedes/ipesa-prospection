import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import Link from 'next/link'
import { APP_NAME } from '@/lib/brand'
import { CtaBand, Ic, PageHero } from '../_ui'
import s from '../inicio.module.css'
import { CheckCheck } from 'lucide-react'

export const metadata: Metadata = pageMeta({
  title: `WhatsApp en tu CRM · ${APP_NAME}`,
  description: 'Atiende el WhatsApp de tu tienda desde Matices, con todo tu equipo en la misma bandeja y cada chat ligado a su cliente. Lo conectas tú, en unos clics.',
  path: '/inicio/whatsapp',
})

const POINTS = [
  { icon: Ic.chat, tone: s.tWa, title: 'Una bandeja para todo el equipo', text: 'Los chats del número de tu tienda en el CRM, sin pasarse el celular.' },
  { icon: Ic.link, tone: s.tBrand, title: 'Cada chat con su cliente', text: 'Mientras respondes ves su historial, sus cotizaciones y su siguiente paso.' },
  { icon: Ic.store, tone: s.tCyan, title: 'Lo conectas tú, en unos clics', text: 'Vinculas el número de tu tienda desde Configuración, sin trámites técnicos. Si usas la app WhatsApp Business, puedes seguir usándola en tu celular.' },
]

export default function WhatsAppPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('WhatsApp', '/inicio/whatsapp')} />
      <PageHero
        title={<><span className={s.waText}>WhatsApp</span> en tu CRM, <span className={s.spectrumText}>con todo tu equipo</span></>}
        lead="Atiende el WhatsApp de tu tienda desde Matices: una sola bandeja para tu equipo, con cada chat ligado a su cliente, su historial y sus cotizaciones."
      >
        <div className={s.heroCtas}>
          <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>Crear cuenta gratis <Ic.arrow className={s.btnArrow} /></Link>
          <Link href="/inicio/precios" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Ver el plan Cubeta</Link>
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
              <p className={s.msgOut}>¡Hola Karen! Sí, tenemos de 19 L. Te mando tu cotización.<span className={s.ticks}><CheckCheck size={14} aria-hidden="true" /></span></p>
              <p className={s.msgIn}>Perfecto, muchas gracias.</p>
            </div>
          </div>
          <div>
            <h2 className={s.h2}>Lo que te da</h2>
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
          Incluido en el plan Cubeta. WhatsApp Business Platform es de Meta y está sujeto a sus políticas;
          responderle a tus clientes no cuesta, y Meta puede cobrar por los mensajes que envías tú primero según sus tarifas vigentes.
        </p>
      </section>

      <CtaBand />
    </>
  )
}
