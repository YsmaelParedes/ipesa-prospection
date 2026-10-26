import type { MetadataRoute } from 'next'
import { PRIVATE_PATHS, SITE_URL } from '@/lib/site'

/** robots.txt: abierto a las páginas públicas; cerrado a la app, la API y las pantallas de acceso. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
