import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { Bullets, CtaBand, Ic, MoreLink, PageHero } from '../_ui'
import { SingleDemo } from '../demos/DemoTabs'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Agente de IA para el WhatsApp de tu tienda · ${APP_NAME}`,
  description: 'Un agente de IA que contesta el WhatsApp de tu tienda de pinturas a cualquier hora con tu información, y pasa el chat a tu equipo cuando hace falta.',
  path: '/inicio/agente-ia',
})

const KNOWS = [
  { icon: Ic.store, tone: s.tBrand, title: 'Información de tu tienda', text: 'Qué vendes, horario, formas de pago, envíos y devoluciones.' },
  { icon: Ic.search, tone: s.tCyan, title: 'Preguntas frecuentes', text: 'Las que más te hacen, con la respuesta que tú escribes.' },
  { icon: Ic.download, tone: s.tAmber, title: 'Archivos', text: 'Tu lista de precios o fichas técnicas en PDF, Word o imagen.' },
  { icon: Ic.link, tone: s.tTeal, title: 'Tu página web', text: 'Pones la dirección y la IA aprende de lo que ahí publicas.' },
]

export default function AgenteIaPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Agente de IA', '/inicio/agente-ia')} />
      <PageHero
        title={<>Un agente de IA que <span className={s.spectrumText}>contesta por ti</span></>}
        lead="Atiende el WhatsApp de tu tienda a cualquier hora con tu información. Cuando el cliente quiere cotizar o hablar con una persona, le pasa el chat a tu equipo y les avisa al celular."
      />

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Pruébalo como si fueras tu cliente</h2>
            <p className={s.sub}>Pregunta por colores o rendimiento, y luego pide una cotización para ver cómo pasa el chat a tu equipo.</p>
          </div>
          <div className={s.demoWrap}><SingleDemo k="whatsapp" /></div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Contesta con lo que tú le enseñas</h2>
            <p className={s.sub}>Todo se configura desde tu CRM, en la pestaña Agente IA de WhatsApp.</p>
          </div>
          <div className={s.features}>
            {KNOWS.map(k => (
              <div key={k.title} className={s.feature}>
                <span className={`${s.featureIcon} ${k.tone}`}><k.icon /></span>
                <h3>{k.title}</h3>
                <p>{k.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <h2 className={s.h2}>Tú pones las reglas</h2>
            <p className={s.sub}>Dile qué hacer en cada situación: pedir el nombre antes de cotizar, no dar precios exactos o pasar al equipo los pedidos grandes. Meta revisa cada regla antes de usarla.</p>
            <Bullets items={[
              'Frases que nunca debe decir',
              'Un recordatorio si el cliente deja de contestar',
              'Pruébala primero solo con tus números, sin costo',
            ]} />
          </div>
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockHead}><strong>Reglas</strong><small>3 activas</small></div>
            {[
              ['Pide información del cliente', 'Antes de cotizar'],
              ['Cotizaciones de obra', 'Más de 10 cubetas: pasa al equipo'],
              ['No dar precios exactos', 'Ofrece la cotización del equipo'],
            ].map(([name, when]) => (
              <div key={name} className={s.mockRow}><span className={s.rowName}>{name}<small>{when}</small></span></div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={`${s.wrap} ${s.center}`}>
          <h2 className={s.h2}>Incluido con WhatsApp en el plan Cubeta</h2>
          <p className={s.sub}>El agente es de Meta y se activa en el número de WhatsApp de tu tienda. Mientras contesta solo a tus números de prueba no cuesta; cuando contesta a todos tus clientes, Meta cobra cada respuesta de la IA.</p>
          <div className={s.centerLink}><MoreLink href="/inicio/whatsapp">Conoce WhatsApp en Matices</MoreLink></div>
        </div>
      </section>

      <CtaBand title="Que tu tienda conteste aunque esté cerrada" />
    </>
  )
}
