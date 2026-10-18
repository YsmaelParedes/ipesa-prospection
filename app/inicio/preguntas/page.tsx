import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/brand'
import { planOf, DEFAULT_PLAN } from '@/lib/stores'
import { CtaBand, Ic, PageHero } from '../_ui'
import s from '../inicio.module.css'

export const metadata: Metadata = {
  title: `Preguntas frecuentes · ${APP_NAME}`,
  description: 'Cómo empezar, cómo se paga, cuántos usuarios incluye, cómo se protege tu información y cómo funciona WhatsApp en Matices.',
}

const MAX_USERS = planOf(DEFAULT_PLAN).maxUsers

const GROUPS: { id: string; title: string; items: { q: string; a: string }[] }[] = [
  {
    id: 'empezar', title: 'Empezar',
    items: [
      { q: '¿Cómo empiezo?', a: 'Pide tu invitación. Acordamos contigo el plan, damos de alta tu tienda y te mandamos un enlace para que crees tu contraseña. Después tú invitas a tu equipo.' },
      { q: '¿Necesito saber de computación?', a: 'No. Se usa desde el navegador, como cualquier página, y te ayudamos a configurar tu tienda y los accesos de tu equipo.' },
      { q: '¿Puedo pasar mis clientes de Excel?', a: 'Sí. Importas tu lista de Excel en un paso y la app te ayuda a relacionar cada columna.' },
      { q: '¿Funciona en el celular?', a: 'Sí. Funciona en cualquier navegador y puedes agregarla a la pantalla de inicio de tu celular para usarla como app y recibir avisos.' },
    ],
  },
  {
    id: 'plan', title: 'Plan y pagos',
    items: [
      { q: '¿Cuánto cuesta?', a: 'No hay un precio general: se acuerda con cada tienda según lo que necesita, y se paga por mes.' },
      { q: '¿Cómo se paga?', a: 'Por transferencia o en efectivo. Si un pago vence, tu información se conserva y tu equipo puede consultarla; para seguir registrando solo hay que renovar.' },
      { q: '¿Cuántas personas pueden usarlo?', a: `El plan Profesional incluye hasta ${MAX_USERS} usuarios por tienda: el dueño y ${MAX_USERS - 1} vendedores, cada uno con su propio acceso.` },
      { q: 'Tengo varias sucursales, ¿cómo funciona?', a: 'Cada cuenta es una sucursal. Si tienes otra, la damos de alta aparte, con su propio equipo y sus datos.' },
    ],
  },
  {
    id: 'informacion', title: 'Tu información',
    items: [
      { q: '¿Otras tiendas pueden ver mis clientes?', a: 'No. Cada tienda tiene su propia información y solo la ve su equipo. Ninguna otra tienda puede acceder a ella.' },
      { q: '¿Mis vendedores pueden llevarse mi base?', a: 'Exportar a Excel, importar y borrar contactos son solo para el dueño. Los vendedores no pueden seleccionar, copiar ni imprimir la información, y su pantalla lleva su nombre en marca de agua.' },
      { q: '¿Qué pasa si dejo de usarlo?', a: 'Tu tienda queda en solo lectura y puedes descargar toda tu información en Excel. No borramos nada a menos que lo pidas por escrito.' },
    ],
  },
  {
    id: 'whatsapp', title: 'WhatsApp',
    items: [
      { q: '¿WhatsApp está incluido?', a: 'Es un servicio adicional con costo aparte. Lo solicitas desde el CRM y un asesor lo configura con el número de tu tienda.' },
      { q: '¿Tengo que hacer algo técnico?', a: 'No. El asesor se encarga de conectar tu número; tú solo empiezas a atender desde el CRM.' },
      { q: '¿Meta cobra aparte?', a: 'WhatsApp Business Platform es de Meta y puede cobrar por los mensajes según sus tarifas vigentes. Tu asesor te explica cómo funciona.' },
    ],
  },
]

export default function PreguntasPage() {
  return (
    <>
      <PageHero
        kicker="Preguntas frecuentes"
        title={<>Lo que suelen <span className={s.spectrumText}>preguntarnos</span></>}
        lead="Si no encuentras tu respuesta, pide tu invitación y platicamos de tu tienda."
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
