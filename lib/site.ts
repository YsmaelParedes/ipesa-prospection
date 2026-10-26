import type { Metadata } from 'next'
import { APP_NAME, APP_TAGLINE } from './brand'

/**
 * Datos del sitio público para buscadores (Google, redes al compartir un enlace).
 * Solo lo usan metadatos, robots, sitemap y datos estructurados; nada de esto
 * cambia lo que ve quien usa el CRM.
 */

/** Dirección pública, sin diagonal final. NEXT_PUBLIC_SITE_URL permite probar en otro dominio. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.matices.app').replace(/\/+$/, '')

export const SITE_DESCRIPTION =
  'Contactos, cotizaciones, agenda y equipo en un solo lugar para tu tienda de pinturas. Empieza gratis.'

/** Páginas que sí deben aparecer en Google. "/" es la portada (/inicio es la misma página, sin duplicarla). */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/inicio/sistema-comercial', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/inicio/contactos', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/agente-ia', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda/tiendas-de-pintura', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda/ferreterias', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/para-tu-tienda/distribuidores', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/funciones', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inicio/precios', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/inicio/whatsapp', priority: 0.8, changeFrequency: 'monthly' },
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
const OG_IMAGE = { url: '/og', ...OG_SIZE, alt: `${APP_NAME} · ${APP_TAGLINE}` }

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

/** Datos estructurados (JSON-LD) de la marca; van en la portada. */
export function organizationJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: APP_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      description: SITE_DESCRIPTION,
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
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: APP_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android, iOS',
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      inLanguage: 'es-MX',
      // Hay un plan gratis (Litro); los planes de paga se cobran al mes con tarjeta
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN', description: 'Plan Litro gratis' },
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
