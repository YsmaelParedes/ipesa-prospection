import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { Bullets, CtaBand, PageHero } from '../_ui'
import { SingleDemo } from '../demos/DemoTabs'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Sistema Comercial para tiendas de pintura · ${APP_NAME}`,
  description: 'A quién llamar hoy, cada llamada registrada en 3 toques, cotizaciones abiertas y metas por vendedor. El sistema de ventas para tu tienda de pinturas.',
  path: '/inicio/sistema-comercial',
})

const JUMPS = [['#hoy', 'Hoy'], ['#oportunidades', 'Oportunidades'], ['#equipo', 'Equipo y metas']]

const STAGES = [
  { name: 'Prospecto', text: 'Aún no hablas con él. Aparece en tu lista para llamarle.' },
  { name: 'Contactado', text: 'Ya hablaste con él. Matices te recuerda cuándo volver a llamar.' },
  { name: 'Cotización', text: 'Le mandaste precio. Queda en Oportunidades hasta que se decida.' },
  { name: 'Cliente', text: 'Te compró. Vuelve a tu lista para la siguiente compra.' },
]

export default function SistemaComercialPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Sistema Comercial', '/inicio/sistema-comercial')} />
      <PageHero
        title={<>Tu equipo sabe <span className={s.spectrumText}>a quién llamar hoy</span></>}
        lead="El Sistema Comercial ordena el día de cada vendedor: lo vencido, lo de hoy y prospectos nuevos para completar su meta. Cada llamada se registra en 3 toques."
      >
        <nav className={s.jumps} aria-label="Ir a una sección">
          {JUMPS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </PageHero>

      {/* Hoy */}
      <section id="hoy" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Hoy: la lista de cada vendedor</h2>
            <p className={s.sub}>Primero lo vencido, luego lo de hoy y al final prospectos nuevos. Toca a un cliente, elige cómo te fue y guarda: la fecha para volver a contactarlo ya viene sugerida.</p>
          </div>
          <div className={s.demoWrap}><SingleDemo k="call" /></div>
        </div>
      </section>

      {/* Avance */}
      <section className={s.section}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <h2 className={s.h2}>Cada cliente avanza en un solo camino</h2>
            <p className={s.sub}>Sin tableros complicados: el resultado de cada llamada mueve al cliente solo. Si no contesta tres veces, baja al final de la lista; si no le interesa, vuelve en 90 días.</p>
            <Bullets items={[
              'El primero que registra una llamada se queda con el cliente',
              'Los que no tienen teléfono aparecen en «Para visita»',
              'Filtra tu lista por zona para hacer tu ruta',
            ]} />
          </div>
          <ol className={s.stageList}>
            {STAGES.map((st, i) => (
              <li key={st.name}><span className={`${s.stepNum} ${s[`n${Math.min(i + 1, 3)}`]}`}>{i + 1}</span><div><strong>{st.name}</strong><p>{st.text}</p></div></li>
            ))}
          </ol>
        </div>
      </section>

      {/* Oportunidades */}
      <section id="oportunidades" className={`${s.section} ${s.sectionAlt}`}>
        <div className={`${s.wrap} ${s.split} ${s.splitRev}`}>
          <div>
            <h2 className={s.h2}>Oportunidades: cada cotización, a la vista</h2>
            <p className={s.sub}>Todas las cotizaciones abiertas, la más vieja primero, con su monto. Cuando el cliente responde, la marcas como Ganada, Perdida o Seguimiento.</p>
            <Bullets items={[
              'Cuánto tienes cotizado y cuánto esperas vender',
              'Aviso de las que llevan más de 7 días sin contacto',
              'El administrador ve las de todo el equipo',
            ]} />
          </div>
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockHead}><strong>Cotizaciones abiertas</strong><small>$89,705 cotizado</small></div>
            {[
              ['Ferretería Arce', '$17,005', 'hace 9 días'],
              ['Constructora Ávila', '$54,000', 'hace 3 días'],
              ['Hotel Sol', '$18,700', 'ayer'],
            ].map(([name, amount, when]) => (
              <div key={name} className={s.mockRow}>
                <span className={s.rowName}>{name}<small>{when}</small></span>
                <strong>{amount}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipo */}
      <section id="equipo" className={s.section}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Equipo: cada vendedor contra su meta</h2>
            <p className={s.sub}>Llamadas, contactos efectivos, cotizaciones, seguimientos y ventas del día y del mes. Tú pones la meta de cada quien. Pruébalo:</p>
          </div>
          <div className={s.demoWrap}><SingleDemo k="team" /></div>
        </div>
      </section>

      <CtaBand title="Pon a vender a tu equipo desde hoy" />
    </>
  )
}
