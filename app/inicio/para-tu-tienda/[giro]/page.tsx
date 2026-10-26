import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { pageMeta, SITE_URL, absoluteUrl } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { CtaBand, Ic, MoreLink, PageHero } from '../../_ui'
import { DemoTabs } from '../../demos/DemoTabs'
import { GIROS, giroBySlug } from '../giros'
import s from '../../inicio.module.css'

/** Una página por giro (tiendas de pintura, ferreterías, distribuidores). */
export function generateStaticParams() {
  return GIROS.map(g => ({ giro: g.slug }))
}
export const dynamicParams = false

type Props = { params: Promise<{ giro: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = giroBySlug((await params).giro)
  if (!g) return {}
  return pageMeta({ title: `${g.title} · ${APP_NAME}`, description: g.description, path: `/inicio/para-tu-tienda/${g.slug}` })
}

const TONES = [s.tBrand, s.tAmber, s.tCyan]

export default async function GiroPage({ params }: Props) {
  const g = giroBySlug((await params).giro)
  if (!g) notFound()
  const path = `/inicio/para-tu-tienda/${g.slug}`
  return (
    <>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: APP_NAME, item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Para tu tienda', item: absoluteUrl('/inicio/para-tu-tienda') },
          { '@type': 'ListItem', position: 3, name: g.name, item: absoluteUrl(path) },
        ],
      }} />
      <PageHero title={<>{g.h1[0]} <span className={s.spectrumText}>{g.h1[1]}</span></>} lead={g.lead} />

      <section className={s.section}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Lo que resuelve en tu negocio</h2>
            <p className={s.sub}>{g.example}</p>
          </div>
          <div className={s.features}>
            {g.pains.map((p, i) => (
              <div key={p.title} className={s.feature}>
                <span className={`${s.featureIcon} ${TONES[i % TONES.length]}`}><Ic.check /></span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Pruébalo aquí mismo</h2>
            <p className={s.sub}>Cuatro pantallas de Matices con clientes de ejemplo. Nada se guarda de verdad.</p>
          </div>
          <div className={s.demoWrap}><DemoTabs /></div>
          <div className={s.centerLink}><MoreLink href="/inicio/precios">Ver precios</MoreLink></div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
