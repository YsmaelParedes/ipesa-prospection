import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/brand'
import { planOf, DEFAULT_PLAN } from '@/lib/stores'
import { CtaBand, Ic, PageHero, SectionHead } from '../_ui'
import s from '../inicio.module.css'

export const metadata: Metadata = {
  title: `Cómo empezar · ${APP_NAME}`,
  description: 'Alta por invitación, precio acordado con tu tienda, tu equipo con su propio acceso y tu información separada y protegida.',
}

const MAX_USERS = planOf(DEFAULT_PLAN).maxUsers

const STEPS = [
  { title: 'Pide tu invitación', text: 'Platicamos de tu tienda, acordamos el plan y damos de alta tu sucursal.' },
  { title: 'Crea tu contraseña', text: 'Te llega tu enlace personal. Configuras el nombre, el logo y tus catálogos con ayuda del asistente.' },
  { title: 'Invita a tu equipo', text: 'Manda a cada vendedor su enlace por WhatsApp o correo. Puedes importar tu lista de clientes de Excel.' },
]

const PLAN = [
  `Hasta ${MAX_USERS} usuarios: tú y ${MAX_USERS - 1} vendedores`,
  'Contactos, cotizaciones, agenda y fórmulas de color',
  'Avisos en el celular y resumen cada mañana',
  'Precio mensual acordado con tu tienda',
  'Pago por transferencia o en efectivo',
  'Te ayudamos a configurarla',
]

const SECURITY = [
  { icon: Ic.layers, title: 'Datos separados por tienda', text: 'Cada consulta se filtra por tu tienda en el servidor. Ninguna otra tienda puede ver tu información.' },
  { icon: Ic.key, title: 'Tu contraseña es solo tuya', text: 'La creas tú con tu enlace de invitación; nadie más la conoce, ni nosotros.' },
  { icon: Ic.users, title: 'Roles y permisos', text: 'Cada vendedor ve sus leads y su agenda. Exportar, importar y borrar contactos son solo para el dueño.' },
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
      <PageHero
        kicker="Cómo empezar"
        title={<>Empieza <span className={s.spectrumText}>sin complicaciones</span></>}
        lead="Matices es por invitación: platicamos contigo, damos de alta tu sucursal y te acompañamos a configurarla con tu equipo."
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
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <span className={s.kicker}>Tu plan</span>
            <h2 className={s.h2}>Plan Profesional, a la medida de tu tienda</h2>
            <p className={s.sub}>No hay un precio general: lo acordamos con cada tienda según lo que necesita. WhatsApp se agrega como servicio adicional.</p>
          </div>
          <div className={s.planCard}>
            <div className={s.planTop}>
              <span className={s.planName}>Profesional</span>
              <strong>Precio acordado</strong>
              <small>por mes, por tienda</small>
            </div>
            <ul className={s.planList}>
              {PLAN.map(p => <li key={p}><span className={s.bulletIcon}><Ic.check /></span>{p}</li>)}
            </ul>
            <div className={s.planAddon}><Ic.chat />WhatsApp y campañas: servicio adicional</div>
          </div>
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
