import type { Metadata } from 'next'
import { APP_NAME, APP_TAGLINE } from './brand'
import type { PublicPrices } from './billing'
import { EMAILS } from './legal'
import { PLANS } from './stores'

/**
 * Datos del sitio público para buscadores (Google, redes al compartir un enlace).
 * Solo lo usan metadatos, robots, sitemap y datos estructurados; nada de esto
 * cambia lo que ve quien usa el CRM.
 */

/** Dirección pública, sin diagonal final. NEXT_PUBLIC_SITE_URL permite probar en otro dominio. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.matices.app').replace(/\/+$/, '')

export const SITE_DESCRIPTION =
  'El CRM para tiendas de pintura: a quién llamar hoy, cotizaciones con seguimiento, metas por vendedor y tu base de clientes por zonas. Empieza gratis.'

/** Páginas que sí deben aparecer en Google. "/" es la portada (/inicio es la misma página, sin duplicarla). */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/inicio/sistema-comercial', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/inicio/contactos', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda/tiendas-de-pintura', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda/ferreterias', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda/distribuidores', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/funciones', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/precios', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/inicio/whatsapp', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/inicio/como-empezar', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/inicio/preguntas', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/registro', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/privacidad', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terminos', priority: 0.3, changeFrequency: 'yearly' },
]

/** Lo que nunca debe indexarse: la app, la API y las pantallas de acceso con datos de una persona. */
export const PRIVATE_PATHS = [
  '/api/', '/auth/', '/login', '/recuperar', '/restablecer', '/invitacion/', '/bienvenida',
  '/contactos', '/comercial', '/whatsapp', '/recordatorios', '/formulas', '/configuracion',
]

export const absoluteUrl = (path: string) => `${SITE_URL}${path === '/' ? '' : path}`

/**
 * Metadatos de una página pública: título, descripción, dirección canónica
 * (la que Google debe guardar) y la ficha que se ve al compartir el enlace.
 * `path` es la dirección real de la página ("/" para la portada).
 */
export const OG_SIZE = { width: 1200, height: 630 }
/** Imagen para compartir el enlace (app/og/route.tsx), con la misma ficha en todas las páginas. */
// ?v=: WhatsApp y las redes guardan la imagen; subir el número al cambiarla
const OG_IMAGE = { url: '/og?v=2', ...OG_SIZE, alt: `${APP_NAME} · ${APP_TAGLINE}` }

export function pageMeta({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: APP_NAME, locale: 'es_MX', title, description, url: path, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  }
}

/** Páginas que Google no debe mostrar (la app y las pantallas de acceso). */
export const SHARE_IMAGE = OG_IMAGE

export const NO_INDEX: Metadata = { robots: { index: false, follow: false } }

/**
 * Los planes como ofertas (schema.org): Litro gratis y los de paga con su
 * precio mensual de Stripe. Sin precios (Stripe falló) solo va Litro.
 */
function planOffers(prices: PublicPrices | null) {
  const url = absoluteUrl('/inicio/precios')
  const offers: object[] = [
    { '@type': 'Offer', name: `Plan ${PLANS.litro.label}`, description: 'Gratis para siempre, sin tarjeta', price: 0, priceCurrency: 'MXN', url },
  ]
  for (const id of ['galon', 'cubeta'] as const) {
    const p = prices?.[id]
    if (!p) continue
    const currency = p.currency.toUpperCase()
    offers.push({
      '@type': 'Offer', name: `Plan ${PLANS[id].label}`, price: p.amount, priceCurrency: currency, url,
      // Cobro mensual por tienda, impuestos incluidos (así se anuncia en Precios)
      priceSpecification: {
        '@type': 'UnitPriceSpecification', price: p.amount, priceCurrency: currency,
        billingDuration: 'P1M', unitCode: 'MON', valueAddedTaxIncluded: true,
      },
    })
  }
  return offers
}

/** El producto (SoftwareApplication) con sus planes; va en la portada y en Precios. */
export function softwareAppJsonLd(prices: PublicPrices | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: APP_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    inLanguage: 'es-MX',
    publisher: { '@id': `${SITE_URL}/#organization` },
    offers: planOffers(prices),
    featureList: [
      'Sistema Comercial: lista de llamadas del día, oportunidades y metas por vendedor',
      'Contactos por zonas, con WhatsApp o teléfono fijo',
      'Agenda y resumen diario en el celular',
      'Bandeja de WhatsApp para todo el equipo, con cada chat ligado a su cliente (plan Cubeta)',
    ],
  }
}

/** Datos estructurados (JSON-LD) de la marca; van en la portada. */
export function organizationJsonLd(prices: PublicPrices | null = null) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: APP_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      description: SITE_DESCRIPTION,
      email: EMAILS.hola,
      areaServed: 'MX',
      contactPoint: {
        '@type': 'ContactPoint', contactType: 'customer support', email: EMAILS.soporte,
        areaServed: 'MX', availableLanguage: 'es',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: APP_NAME,
      alternateName: `${APP_NAME} · ${APP_TAGLINE}`,
      url: SITE_URL,
      inLanguage: 'es-MX',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    softwareAppJsonLd(prices),
    {
      // Video del hero: así Google puede mostrarlo en resultados de video
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: `Así se usa ${APP_NAME}`,
      description: 'Un día con Matices: el resumen de pendientes en el celular, la meta del día, la búsqueda de un cliente en Contactos, una venta ganada y el avance del equipo.',
      thumbnailUrl: `${SITE_URL}/video/matices-demo.jpg`,
      contentUrl: `${SITE_URL}/video/matices-demo.mp4`,
      uploadDate: '2026-10-27',
      duration: 'PT23S',
      inLanguage: 'es-MX',
    },
  ]
}

/** FAQPage: solo con preguntas que están a la vista en la misma página. */
export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(i => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
  }
}

/** Migas de pan de una página interna (Inicio › Sección). */
export function breadcrumbJsonLd(name: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: APP_NAME, item: SITE_URL },
      { '@type': 'ListItem', position: 2, name, item: absoluteUrl(path) },
    ],
  }
}
