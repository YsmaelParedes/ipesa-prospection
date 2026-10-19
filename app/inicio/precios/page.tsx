import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/brand'
import { PLANS } from '@/lib/stores'
import { CtaBand, PageHero, SectionHead } from '../_ui'
import { PricingCards, PricingCompare } from '../Pricing'
import s from '../inicio.module.css'

export const metadata: Metadata = {
  title: `Precios · ${APP_NAME}`,
  description: 'Plan Litro gratis para empezar, Galón para tu equipo sin límites y Cubeta con WhatsApp. Pago mensual con tarjeta; cambia o cancela cuando quieras.',
}

const NOTES = [
  { q: '¿Necesito tarjeta para empezar?', a: `No. El plan Litro es gratis para siempre: ${PLANS.litro.maxContacts} contactos y ${PLANS.litro.maxLeads} cotizaciones, con agenda y avisos en el celular.` },
  { q: '¿Cómo se paga?', a: 'Con tarjeta de crédito o débito, cada mes, a través de Stripe. Nosotros nunca vemos ni guardamos los datos de tu tarjeta.' },
  { q: '¿Puedo cambiar o cancelar?', a: 'Cuando quieras, desde tu CRM. Si cancelas, conservas tu plan hasta el final del mes pagado y después pasas a Litro.' },
  { q: '¿Qué pasa si bajo de plan?', a: 'No se borra nada. Lo que pase del límite se conserva y lo sigues viendo; solo no puedes registrar más hasta volver a subir.' },
]

export default function PreciosPage() {
  return (
    <>
      <PageHero
        kicker="Precios"
        title={<>Empieza gratis, <span className={s.spectrumText}>crece cuando quieras</span></>}
        lead="Tres planes para cada etapa de tu tienda. Pago mensual con tarjeta, sin plazos forzosos."
      />

      <section className={s.section}>
        <div className={s.wrap}>
          <PricingCards />
          <p className={s.finePrint}>Precios en pesos mexicanos, por tienda. Si necesitas factura, pídela al contratar.</p>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead kicker="Compara" title="Lo que incluye cada plan" />
          <PricingCompare />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead kicker="Dudas" title="Sobre los pagos" />
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
