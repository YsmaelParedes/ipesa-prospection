import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { Bullets, CtaBand, Ic, MoreLink, PageHero, SectionHead } from '../_ui'
import { QuoteDemoStage } from '../demos/QuoteDemo'
import { QuoteListMock, QuoteWhatsAppMock } from './mocks'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Cotizaciones en PDF por WhatsApp y correo · ${APP_NAME}`,
  description: 'Arma cotizaciones con tus productos y precios, con tu logo, descuento e IVA. Mándalas en PDF por WhatsApp o correo y dales seguimiento hasta la venta.',
  path: '/inicio/cotizaciones',
})

const JUMPS = [['#armar', 'Armar'], ['#enviar', 'Enviar'], ['#seguimiento', 'Seguimiento']]

const POINTS = [
  { icon: Ic.search, tone: s.tCyan, title: 'Tu último precio, a la mano', text: 'Escribe parte del nombre y aparece el producto con el precio al que lo cotizaste la última vez.' },
  { icon: Ic.percent, tone: s.tAmber, title: 'Descuento e IVA', text: 'Un descuento en porcentaje o en pesos. IVA de 16 % u 8 %, o sin IVA para quien no pide factura.' },
  { icon: Ic.store, tone: s.tBrand, title: 'Con los datos de tu tienda', text: 'Tu logo, razón social, RFC y condiciones de venta salen en cada hoja. Los configuras una vez.' },
  { icon: Ic.download, tone: s.tTeal, title: 'PDF tamaño carta', text: 'Descárgala o imprímela: el PDF se ve igual que en la pantalla.' },
  { icon: Ic.contacts, tone: s.tMagenta, title: 'Desde la ficha del cliente', text: 'Toca «Cotizar» en Contactos o en Comercial y los datos del cliente ya vienen llenos.' },
  { icon: Ic.layers, tone: s.tWa, title: 'En todos los planes', text: 'También en Litro, el plan gratis. En Litro la hoja lleva al pie «Hecha con Matices».' },
]

export default function CotizacionesPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Cotizaciones', '/inicio/cotizaciones')} />
      <PageHero
        title={<>Cotiza en un minuto y <span className={s.spectrumText}>mándala por WhatsApp</span></>}
        lead="Arma la cotización con tus productos, mírala tal como la recibirá tu cliente y mándala en PDF por WhatsApp o correo. Matices le da seguimiento por ti."
      >
        <nav className={s.jumps} aria-label="Ir a una sección">
          {JUMPS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </PageHero>

      {/* Armar */}
      <section id="armar" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead
            title="Escribe y mira la hoja al momento"
            sub="Cambia una cantidad, quita un producto o pon un descuento: la cotización se actualiza al momento, con tus datos y tus condiciones. Pruébalo:"
          />
          <div className={s.demoWrap}><QuoteDemoStage /></div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead title="Todo lo que lleva una cotización" />
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

      {/* Enviar */}
      <section id="enviar" className={`${s.section} ${s.sectionAlt}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <h2 className={s.h2}>Mándala por donde tu cliente contesta</h2>
            <p className={s.sub}>Por WhatsApp va un mensaje listo con el enlace a la cotización; por correo, con el PDF adjunto. En el celular también la compartes como PDF.</p>
            <Bullets items={[
              'El mensaje ya lleva el nombre del cliente, el folio y el total',
              'Si tu cliente contesta el correo, la respuesta te llega a ti',
              'Sabes cuándo abrió tu cliente la cotización',
            ]} />
          </div>
          <QuoteWhatsAppMock />
        </div>
      </section>

      {/* Seguimiento */}
      <section id="seguimiento" className={s.section}>
        <div className={`${s.wrap} ${s.split} ${s.splitRev}`}>
          <div>
            <h2 className={s.h2}>Cada cotización enviada tiene su seguimiento</h2>
            <p className={s.sub}>Al enviarla, el cliente pasa a Oportunidades con su monto y Matices te recuerda llamarle en 2 días. Cuando acepta, registras la venta en un toque.</p>
            <Bullets items={[
              'Borrador, Enviada, Aceptada o Rechazada; Vencida cuando pasa su fecha',
              'Cuánto cotizaste y cuánto te aceptaron en el mes',
              'Duplica una cotización para otro cliente',
              'Todas las cotizaciones de un cliente, en su ficha',
            ]} />
            <MoreLink href="/inicio/sistema-comercial#oportunidades">Conoce Oportunidades</MoreLink>
          </div>
          <QuoteListMock />
        </div>
      </section>

      <CtaBand title="Manda tu primera cotización hoy" />
    </>
  )
}
