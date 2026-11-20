import type { Metadata } from 'next'
import { breadcrumbJsonLd, faqJsonLd, pageMeta, softwareAppJsonLd } from '@/lib/site'
import { getPublicPriceTable } from '@/lib/publicPrices'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { PLANS, TRIAL_DAYS } from '@/lib/stores'
import { EMAILS } from '@/lib/legal'
import { CtaBand, PageHero, SectionHead } from '../_ui'
import { PricingCards, PricingCompare } from '../Pricing'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Precios del CRM para tiendas de pintura · ${APP_NAME}`,
  // Hasta 160 caracteres: Google corta las descripciones más largas
  description: 'Prueba Cubeta 14 días gratis, sin tarjeta. Litro gratis para trabajar solo y Cubeta para tu tienda con su equipo y su WhatsApp. Pago mensual o anual, con factura.',
  path: '/inicio/precios',
})

const NOTES = [
  { q: '¿Necesito tarjeta para empezar?', a: `No. Tu tienda empieza con ${TRIAL_DAYS} días de Cubeta gratis, sin tarjeta. Al terminar eliges tu plan o sigues en Litro, gratis para siempre: ${PLANS.litro.maxContacts?.toLocaleString('es-MX')} clientes, tu lista de Hoy, cotizaciones y recordatorios.` },
  { q: '¿Cómo se paga?', a: 'Con tarjeta de crédito o débito, cada mes o cada año (el anual trae 2 meses gratis), a través de Stripe. Nosotros nunca vemos ni guardamos los datos de tu tarjeta.' },
  { q: '¿Me dan factura?', a: 'Sí. Escríbenos a facturacion@matices.app con tus datos fiscales y te enviamos tu factura de cada pago.' },
  { q: '¿Puedo cambiar o cancelar?', a: 'Cuando quieras, desde tu CRM. Si cancelas, conservas tu plan hasta el final del mes pagado y después pasas a Litro.' },
  { q: '¿Qué pasa si bajo de plan?', a: 'No se borra nada. Lo que pase del límite se conserva y lo sigues viendo; solo no puedes registrar más hasta volver a subir.' },
]

// Los precios de Stripe van en el HTML (y en los datos estructurados): se regenera cada hora
export const revalidate = 3600

export default async function PreciosPage() {
  const priceTable = await getPublicPriceTable()
  const prices = priceTable?.monthly ?? null
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd('Precios', '/inicio/precios'), softwareAppJsonLd(prices), faqJsonLd(NOTES)]} />
      <PageHero
        title={<>Empieza gratis, <span className={s.spectrumText}>crece cuando quieras</span></>}
        lead="Dos planes: Litro, gratis para trabajar tú solo, y Cubeta, para tu tienda con su equipo y su WhatsApp. Prueba Cubeta 14 días gratis; después, pago mensual o anual con tarjeta, sin plazos forzosos."
      />

      <section className={s.section}>
        <div className={s.wrap}>
          <PricingCards initial={priceTable} />
          <p className={s.finePrint}>Precios por tienda, en pesos mexicanos (MXN) e impuestos incluidos. Si necesitas factura, escríbenos a <a href={`mailto:${EMAILS.facturacion}`}>{EMAILS.facturacion}</a>.</p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead title="Lo que incluye cada plan" />
          <PricingCompare />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead title="Sobre los pagos" />
          <div className={s.priceNotes}>
            {NOTES.map(n => (
              <div key={n.q} className={s.priceNote}>
                <h3>{n.q}</h3>
                <p>{n.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Tu tienda, organizada desde hoy" text="Crea tu cuenta gratis en un minuto y cambia de plan cuando tu tienda lo necesite." />
    </>
  )
}
