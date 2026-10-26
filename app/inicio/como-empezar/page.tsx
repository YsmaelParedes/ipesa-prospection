import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { CtaBand, Ic, PageHero, SectionHead } from '../_ui'
import { PricingCards } from '../Pricing'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Cómo empezar · ${APP_NAME}`,
  description: 'Crea tu cuenta gratis, configura tu tienda, invita a tu equipo y elige el plan que necesitas. Tu información, separada y protegida.',
  path: '/inicio/como-empezar',
})

const STEPS = [
  { title: 'Crea tu cuenta gratis', text: 'Con tu correo, en un minuto y sin tarjeta. Empiezas en el plan Litro.' },
  { title: 'Configura tu tienda', text: 'Nombre, logo y catálogos con ayuda del asistente. Puedes importar tu lista de clientes de Excel.' },
  { title: 'Elige tu plan e invita a tu equipo', text: 'Cuando lo necesites, cambia a Galón o Cubeta y manda a cada vendedor su enlace por WhatsApp o correo.' },
]

const SECURITY = [
  { icon: Ic.layers, title: 'Datos separados por tienda', text: 'Cada consulta se filtra por tu tienda en el servidor. Ninguna otra tienda puede ver tu información.' },
  { icon: Ic.key, title: 'Tu contraseña es solo tuya', text: 'La creas tú al registrarte o con tu enlace de invitación; nadie más la conoce, ni nosotros.' },
  { icon: Ic.users, title: 'Roles y permisos', text: 'Cada vendedor ve sus leads y su agenda. Exportar, importar y borrar contactos son solo para administradores.' },
  { icon: Ic.eyeOff, title: 'Base protegida', text: 'Los vendedores no pueden copiar ni imprimir la información, y su pantalla lleva su nombre en marca de agua.' },
  { icon: Ic.link, title: 'Accesos bajo tu control', text: 'Invitaciones que vencen y la opción de desactivar a quien ya no trabaje contigo.' },
  { icon: Ic.download, title: 'Tu información es tuya', text: 'Si un día te vas, descargas todo en Excel. No borramos nada sin que lo pidas por escrito.' },
]

const NEEDS = [
  { icon: Ic.grid, title: 'Una computadora o tableta', text: 'Funciona en cualquier navegador actual: no hay nada que instalar.' },
  { icon: Ic.phone, title: 'Tu celular', text: 'Agrégala a la pantalla de inicio para usarla como app y recibir avisos.' },
  { icon: Ic.contacts, title: 'Tu lista de clientes (opcional)', text: 'Si la tienes en Excel, la importas en un paso. Si no, empiezas desde cero.' },
]

export default function ComoEmpezarPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Cómo empezar', '/inicio/como-empezar')} />
      <PageHero
        kicker="Cómo empezar"
        title={<>Empieza <span className={s.spectrumText}>sin complicaciones</span></>}
        lead="Crea tu cuenta gratis, configura tu tienda en minutos y elige el plan que necesitas cuando tu equipo crezca."
      />

      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead kicker="Paso a paso" title="Así empiezas" />
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.stepCard}>
                <span className={`${s.stepNum} ${s[`n${i + 1}`]}`}>{i + 1}</span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead kicker="Tu plan" title="Empieza gratis y cambia cuando quieras" sub="Pago mensual con tarjeta a través de Stripe. Sin plazos forzosos: cambias o cancelas desde tu CRM." />
          <div style={{ marginTop: 44 }}><PricingCards /></div>
        </div>
      </section>

      <section id="seguridad" className={`${s.section} ${s.dark}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <span className={s.kicker}>Seguridad</span>
            <h2 className={s.h2}>La información de tu tienda es solo de tu tienda</h2>
            <p className={s.sub}>La separación por tienda está construida desde la base de datos, y tú decides qué puede hacer tu equipo.</p>
          </div>
          <div className={`${s.secGrid} ${s.secGrid3}`}>
            {SECURITY.map(it => (
              <div key={it.title} className={s.secItem}>
                <span className={s.secIcon}><it.icon /></span>
                <h3>{it.title}</h3>
                <p>{it.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead kicker="Lo que necesitas" title="Nada que instalar" />
          <div className={`${s.features} ${s.features3}`}>
            {NEEDS.map(n => (
              <div key={n.title} className={s.feature}>
                <span className={`${s.featureIcon} ${s.tCyan}`}><n.icon /></span>
                <h3>{n.title}</h3>
                <p>{n.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
