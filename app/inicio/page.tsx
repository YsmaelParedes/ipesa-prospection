import type { Metadata } from 'next'
import { organizationJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import Link from 'next/link'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { PLANS } from '@/lib/stores'
import { CtaBand, Ic, MoreLink, SectionHead } from './_ui'
import { DemoTabs } from './demos/DemoTabs'
import { HeroVideo } from './demos/HeroVideo'
import { PricingCards } from './Pricing'
import s from './inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `${APP_NAME} · ${APP_TAGLINE}`,
  description: 'El CRM para tiendas de pintura: a quién llamar hoy, cotizaciones con seguimiento, metas por vendedor y tu base de clientes por zonas. Empieza gratis.',
  // /inicio es la misma página que la portada "/": Google guarda solo "/"
  path: '/',
})

/* Inicio del sitio de presentación: lo ve quien entra a "/" sin sesión (ver proxy.ts). */

const FEATURES = [
  { icon: Ic.grid,      tone: s.tBrand,   title: 'Sistema Comercial', text: 'Hoy, Oportunidades y Equipo: a quién llamar, cotizaciones abiertas y metas por vendedor.', href: '/inicio/sistema-comercial' },
  { icon: Ic.contacts,  tone: s.tCyan,    title: 'Contactos', text: 'Tu base por zonas, con WhatsApp o fijo, importada desde Excel y lista para visitar.', href: '/inicio/contactos' },
  { icon: Ic.bell,      tone: s.tTeal,    title: 'Agenda y avisos', text: 'El resumen de tus pendientes cada mañana en tu celular, aunque la app esté cerrada.', href: '/inicio/funciones#agenda' },
  { icon: Ic.users,     tone: s.tAmber,   title: 'Tu equipo y tu base, protegidos', text: 'Administradores y vendedores, cada quien con su usuario. Exportar y borrar, solo administradores.', href: '/inicio/funciones#equipo' },
  { icon: Ic.chat,      tone: s.tWa,      title: 'Próximamente: WhatsApp', text: 'Atiende el WhatsApp de tu tienda desde el CRM, con un agente de IA que contesta por ti.', href: '/inicio/whatsapp' },
]

const STEPS = [
  { title: 'Crea tu cuenta gratis', text: 'En un minuto y sin tarjeta. Empiezas en el plan Litro.' },
  { title: 'Configura tu sucursal', text: 'Nombre, logo y catálogos. El asistente te guía paso a paso.' },
  { title: 'Invita a tu equipo', text: 'Manda a cada vendedor su enlace por WhatsApp o correo y a vender.' },
]

export default function LandingPage() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      {/* ── Presentación ── */}
      <section className={s.hero}>
        <div className={`${s.wrap} ${s.heroGrid} ${s.heroStack}`}>
          <div className={s.heroCopy}>
            <h1 className={s.h1}>El CRM hecho para tiendas <span className={s.spectrumText}>de pintura</span></h1>
            <p className={s.lead}>
              Tu equipo sabe a quién llamar hoy, registra cada llamada en 3 toques y tú ves cómo va la
              venta de tu sucursal, desde el celular o la computadora.
            </p>
            <div className={s.heroCtas}>
              <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>
                Crear cuenta gratis <Ic.arrow className={s.btnArrow} />
              </Link>
              <a href="#demo" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Pruébalo aquí abajo</a>
            </div>
            <div className={s.checks}>
              <span><Ic.check />Gratis para empezar</span>
              <span><Ic.check />Lista en minutos</span>
              <span><Ic.check />Celular y computadora</span>
            </div>
          </div>

          <div className={s.visual}>
            <div className={s.swirl} aria-hidden="true"><i className={s.b1} /><i className={s.b2} /><i className={s.b3} /><i className={s.b4} /><i className={s.b5} /></div>
            <HeroVideo />
          </div>
        </div>
      </section>

      {/* ── Datos rápidos ── */}
      <section className={s.strip} aria-label="En resumen">
        <div className={`${s.wrap} ${s.stripGrid}`}>
          <div className={s.stat}><strong>Gratis</strong><span>para empezar, sin tarjeta</span></div>
          <div className={s.stat}><strong>Hasta {PLANS.cubeta.maxUsers}</strong><span>usuarios por tienda en el plan Cubeta</span></div>
          <div className={s.stat}><strong>Tus datos</strong><span>separados y protegidos por tienda</span></div>
          <div className={s.stat}><strong>100% web</strong><span>y se instala como app en tu celular</span></div>
        </div>
      </section>

      {/* ── Demos ── */}
      <section id="demo" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead
            title="Pruébalo aquí mismo, sin crear cuenta"
            sub="Tres pantallas de Matices con clientes de ejemplo. Toca, escribe y guarda: nada se guarda de verdad."
          />
          <div className={s.demoWrap}><DemoTabs /></div>
        </div>
      </section>

      {/* ── Funciones ── */}
      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead
            title="Conoce cada parte de Matices"
            sub="Pensado para cómo vende una tienda de pinturas: muchos clientes, cotizaciones que van y vienen y seguimientos todo el día."
          />
          <div className={s.features}>
            {FEATURES.map(f => (
              <Link key={f.title} href={f.href} className={s.feature}>
                <span className={`${s.featureIcon} ${f.tone}`}><f.icon /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <span className={s.featureMore}>Ver más <Ic.arrow /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo empezar ── */}
      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead title="Empieza hoy, en tres pasos" />
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.stepCard}>
                <span className={`${s.stepNum} ${s[`n${i + 1}`]}`}>{i + 1}</span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
          <div className={s.centerLink}><MoreLink href="/inicio/como-empezar">Seguridad y requisitos</MoreLink></div>
        </div>
      </section>

      {/* ── Precios ── */}
      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead title="Empieza gratis, crece cuando quieras" sub="Pago mensual con tarjeta. Cambia o cancela cuando quieras desde tu CRM." />
          <div style={{ marginTop: 44 }}><PricingCards /></div>
          <div className={s.centerLink}><MoreLink href="/inicio/precios">Compara los planes</MoreLink></div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
