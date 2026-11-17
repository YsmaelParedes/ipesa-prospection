import type { Metadata } from 'next'
import { breadcrumbJsonLd, faqJsonLd, pageMeta, softwareAppJsonLd } from '@/lib/site'
import { getPublicPrices } from '@/lib/publicPrices'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { PLANS } from '@/lib/stores'
import { EMAILS } from '@/lib/legal'
import { CtaBand, PageHero, SectionHead } from '../_ui'
import { PricingCards, PricingCompare } from '../Pricing'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Precios del CRM para tiendas de pintura · ${APP_NAME}`,
  // Hasta 160 caracteres: Google corta las descripciones más largas
  description: 'Litro gratis para empezar, Galón para vender en equipo y Cubeta para dirigir un equipo más grande, con WhatsApp. Pago mensual con tarjeta, sin plazos forzosos.',
  path: '/inicio/precios',
})

const NOTES = [
  { q: '¿Necesito tarjeta para empezar?', a: `No. El plan Litro es gratis para siempre: ${PLANS.litro.maxContacts} contactos, tu cola de llamadas, agenda y avisos en el celular.` },
  { q: '¿Cómo se paga?', a: 'Con tarjeta de crédito o débito, cada mes, a través de Stripe. Nosotros nunca vemos ni guardamos los datos de tu tarjeta.' },
  { q: '¿Puedo cambiar o cancelar?', a: 'Cuando quieras, desde tu CRM. Si cancelas, conservas tu plan hasta el final del mes pagado y después pasas a Litro.' },
  { q: '¿Qué pasa si bajo de plan?', a: 'No se borra nada. Lo que pase del límite se conserva y lo sigues viendo; solo no puedes registrar más hasta volver a subir.' },
]

// Los precios de Stripe van en el HTML (y en los datos estructurados): se regenera cada hora
export const revalidate = 3600

export default async function PreciosPage() {
  const prices = await getPublicPrices()
  return (
    <>
      <JsonLd data={[breadcrumbJsonLd('Precios', '/inicio/precios'), softwareAppJsonLd(prices), faqJsonLd(NOTES)]} />
      <PageHero
        title={<>Empieza gratis, <span className={s.spectrumText}>crece cuando quieras</span></>}
        lead="Tres planes para cada etapa de tu tienda. Pago mensual con tarjeta, sin plazos forzosos."
      />

      <section className={s.section}>
        <div className={s.wrap}>
          <PricingCards initial={prices} />
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
