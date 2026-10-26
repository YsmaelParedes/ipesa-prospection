import type { MetadataRoute } from 'next'
import { PUBLIC_PAGES, absoluteUrl } from '@/lib/site'
import { CURRENT_VERSION, CHANGELOG } from '@/lib/changelog'

/**
 * sitemap.xml: una entrada por cada página pública real. La fecha de
 * modificación es la de la versión vigente de la app (las páginas se publican
 * con cada versión), así que no cambia en cada visita de Google.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = CHANGELOG.find(e => e.version === CURRENT_VERSION) ?? CHANGELOG[0]
  const lastModified = parseSpanishDate(latest?.date)
  return PUBLIC_PAGES.map(p => ({
    url: absoluteUrl(p.path),
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "24 de octubre, 2026" → Date (undefined si no se entiende). */
function parseSpanishDate(text: string | undefined): Date | undefined {
  const m = /^(\d{1,2}) de ([a-záéíóú]+),? (\d{4})$/i.exec(text ?? '')
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1
  return m && month >= 0 ? new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12)) : undefined
}
