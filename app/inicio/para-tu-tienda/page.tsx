import type { Metadata } from 'next'
import Link from 'next/link'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { CtaBand, Ic, PageHero } from '../_ui'
import { GIROS } from './giros'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `CRM por tipo de negocio: pintura y ferretería · ${APP_NAME}`,
  description: 'Matices para tiendas de pintura, ferreterías y distribuidores: el mismo CRM, pensado para cómo vende cada negocio.',
  path: '/inicio/para-tu-tienda',
})

const TONES = [s.tBrand, s.tAmber, s.tCyan]

export default function ParaTuTiendaPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Para tu tienda', '/inicio/para-tu-tienda')} />
      <PageHero
        title={<>Hecho para <span className={s.spectrumText}>cómo vende tu negocio</span></>}
        lead="Tiendas de pintura, ferreterías y distribuidores usan Matices para ordenar a sus clientes y dar seguimiento a cada venta."
      />
      <section className={s.section}>
        <div className={s.wrap}>
          <div className={s.features}>
            {GIROS.map((g, i) => (
              <Link key={g.slug} href={`/inicio/para-tu-tienda/${g.slug}`} className={s.feature}>
                <span className={`${s.featureIcon} ${TONES[i % TONES.length]}`}><Ic.store /></span>
                <h3>{g.name}</h3>
                <p>{g.lead}</p>
                <span className={s.featureMore}>Ver más <Ic.arrow /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  )
}
