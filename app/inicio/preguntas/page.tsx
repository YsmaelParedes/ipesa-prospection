import type { Metadata } from 'next'
import { breadcrumbJsonLd, faqJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { PLANS } from '@/lib/stores'
import { CtaBand, Ic, PageHero } from '../_ui'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Preguntas frecuentes · ${APP_NAME}`,
  description: 'Cómo empezar, cómo se paga, cuántos usuarios incluye, cómo se protege tu información y cómo funciona WhatsApp en Matices.',
  path: '/inicio/preguntas',
})


const GROUPS: { id: string; title: string; items: { q: string; a: string }[] }[] = [
  {
    id: 'empezar', title: 'Empezar',
    items: [
      { q: '¿Cómo empiezo?', a: 'Crea tu cuenta gratis con tu correo, confirma el enlace que te llega y el asistente te ayuda a configurar tu tienda. Empiezas en el plan Litro y cambias de plan cuando quieras.' },
      { q: '¿Necesito saber de computación?', a: 'No. Se usa desde el navegador, como cualquier página, y te ayudamos a configurar tu tienda y los accesos de tu equipo.' },
      { q: '¿Puedo pasar mis clientes de Excel?', a: 'Sí. Importas tu lista de Excel en un paso y la app te ayuda a relacionar cada columna.' },
      { q: '¿Funciona en el celular?', a: 'Sí. Funciona en cualquier navegador y puedes agregarla a la pantalla de inicio de tu celular para usarla como app y recibir avisos.' },
    ],
  },
  {
    id: 'plan', title: 'Plan y pagos',
    items: [
      { q: '¿Cuánto cuesta?', a: `El plan Litro es gratis (${PLANS.litro.maxContacts} contactos). Galón y Cubeta se pagan cada mes; consulta los precios en la página de Precios.` },
      { q: '¿Cómo se paga?', a: 'Con tarjeta de crédito o débito, cada mes, a través de Stripe. Nosotros nunca vemos los datos de tu tarjeta. Si un cobro no pasa, Stripe lo reintenta; si al final no se cobra, tu tienda vuelve al plan Litro sin borrar nada.' },
      { q: '¿Puedo cancelar?', a: 'Cuando quieras, desde Configuración → Plan. Conservas tu plan hasta el final del mes pagado y después pasas a Litro.' },
      { q: '¿Cuántas personas pueden usarlo?', a: `Litro es para una sola persona, el administrador. Galón incluye hasta ${PLANS.galon.maxUsers} usuarios y Cubeta hasta ${PLANS.cubeta.maxUsers}, con administradores. Cada quien con su propio acceso.` },
      { q: 'Tengo varias sucursales, ¿cómo funciona?', a: 'Cada cuenta es una sucursal, con su propio plan, equipo y datos. Si tienes otra, escríbenos y la damos de alta aparte.' },
    ],
  },
  {
    id: 'informacion', title: 'Tu información',
    items: [
      { q: '¿Otras tiendas pueden ver mis clientes?', a: 'No. Cada tienda tiene su propia información y solo la ve su equipo. Ninguna otra tienda puede acceder a ella.' },
      { q: '¿Mis vendedores pueden llevarse mi base?', a: 'Exportar a Excel, importar y borrar contactos son solo para administradores. Los vendedores no pueden seleccionar, copiar ni imprimir la información, y su pantalla lleva su nombre en marca de agua.' },
      { q: '¿Qué pasa si dejo de pagar o bajo de plan?', a: 'Tu tienda pasa al plan Litro: lo que pase del límite se conserva y lo sigues viendo, y puedes descargar toda tu información en Excel. No borramos nada a menos que lo pidas por escrito.' },
    ],
  },
  {
    id: 'whatsapp', title: 'WhatsApp',
    items: [
      { q: '¿WhatsApp está incluido?', a: 'Sí, en el plan Cubeta. Lo solicitas desde el CRM y un asesor lo configura con el número de tu tienda.' },
      { q: '¿Tengo que hacer algo técnico?', a: 'No. El asesor se encarga de conectar tu número; tú solo empiezas a atender desde el CRM.' },
      { q: '¿Meta cobra aparte?', a: 'WhatsApp Business Platform es de Meta y puede cobrar por los mensajes según sus tarifas vigentes. Tu asesor te explica cómo funciona.' },
    ],
  },
]

export default function PreguntasPage() {
  return (
    <>
      {/* Las mismas preguntas y respuestas que se ven en la página */}
      <JsonLd data={[faqJsonLd(GROUPS.flatMap(g => g.items)), breadcrumbJsonLd('Preguntas frecuentes', '/inicio/preguntas')]} />
      <PageHero
        kicker="Preguntas frecuentes"
        title={<>Lo que suelen <span className={s.spectrumText}>preguntarnos</span></>}
        lead="Si no encuentras tu respuesta, escríbenos y platicamos de tu tienda."
      >
        <nav className={s.jumps} aria-label="Temas">
          {GROUPS.map(g => <a key={g.id} href={`#${g.id}`}>{g.title}</a>)}
        </nav>
      </PageHero>

      <section className={s.section}>
        <div className={`${s.wrap} ${s.faqLayout}`}>
          {GROUPS.map(g => (
            <div key={g.id} id={g.id} className={s.faqGroup}>
              <h2 className={s.faqGroupTitle}>{g.title}</h2>
              <div className={s.faq}>
                {g.items.map(f => (
                  <details key={f.q}>
                    <summary>{f.q}<span className={s.plus}><Ic.plus /></span></summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <CtaBand title="¿Listo para empezar?" />
    </>
  )
}
