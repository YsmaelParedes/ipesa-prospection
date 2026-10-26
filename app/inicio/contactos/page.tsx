import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { Bullets, CtaBand, Ic, PageHero } from '../_ui'
import { SingleDemo } from '../demos/DemoTabs'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Contactos y base de clientes · ${APP_NAME}`,
  description: 'Tu base de clientes por zonas, con WhatsApp o fijo, importada desde Excel y lista para visitar. Busca sin acentos y encuentra a cualquier cliente en segundos.',
  path: '/inicio/contactos',
})

const POINTS = [
  { icon: Ic.download, tone: s.tCyan, title: 'Importa tu Excel', text: 'Sube tu lista y relaciona cada columna en un paso.' },
  { icon: Ic.grid, tone: s.tAmber, title: 'Por zonas', text: 'Ordena tu base por zona y filtra para armar tu ruta del día.' },
  { icon: Ic.chat, tone: s.tWa, title: 'WhatsApp o fijo', text: 'Se marca solo con los mensajes, o lo marcas al llamar.' },
  { icon: Ic.store, tone: s.tBrand, title: 'Para visita', text: 'Los negocios sin teléfono se guardan con su dirección para visitarlos.' },
]

export default function ContactosPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Contactos', '/inicio/contactos')} />
      <PageHero
        title={<>Toda tu base, <span className={s.spectrumText}>lista para vender</span></>}
        lead="Miles de contactos sin que la app se vuelva lenta: búscalos sin acentos, fíltralos por zona o por tipo de teléfono y abre su ficha con todo su historial."
      />

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Encuentra a cualquier cliente en segundos</h2>
            <p className={s.sub}>Escribe «jose» y aparece José. Filtra los que tienen WhatsApp, los fijos o los que hay que visitar.</p>
          </div>
          <div className={s.demoWrap}><SingleDemo k="contacts" /></div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <div className={s.features}>
            {POINTS.map(p => (
              <div key={p.title} className={s.feature}>
                <span className={`${s.featureIcon} ${p.tone}`}><p.icon /></span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <h2 className={s.h2}>Tu base se queda en tu tienda</h2>
            <p className={s.sub}>Tu equipo atiende a los clientes, pero sacar la base es solo para administradores.</p>
            <Bullets items={[
              'Exportar a Excel, importar y borrar: solo administradores',
              'Los vendedores no pueden copiar ni imprimir la información',
              'Cada contacto con su historial de llamadas y cotizaciones',
            ]} />
          </div>
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockSearch}><Ic.search />Buscar nombre o teléfono…</div>
            {[
              ['José Pérez', 'Puebla · Pintor', 'WhatsApp'],
              ['Ferretería Arce', 'Atlixco · Ferretería', 'Fijo'],
              ['Ferre Materiales del Valle', 'San Andrés · Ferretería', 'Para visita'],
            ].map(([name, sub, tag]) => (
              <div key={name} className={s.mockRow}><span className={s.rowName}>{name}<small>{sub}</small></span><em className={s.mockTag}>{tag}</em></div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Sube tu Excel y empieza hoy" />
    </>
  )
}
