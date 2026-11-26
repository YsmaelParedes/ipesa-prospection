import type { QueryPolicy } from './queryCache'

export function queryPolicy(path: string): QueryPolicy | null {
  const p = path.split('?')[0]
  const normal = { staleTime: 30_000, maxAge: 600_000 }
  if (p === '/api/data/export' || p.includes('/media/') || p.endsWith('/pdf')) return null
  if (p === '/api/data/reminders') return { ...normal, poll: 60_000 }
  if (p.startsWith('/api/data/config') || p.startsWith('/api/formulas') || ['/api/whatsapp/templates', '/api/whatsapp/template-image'].includes(p) || p.startsWith('/api/whatsapp/quick-replies')) return { ...normal, staleTime: 300_000 }
  if (p.startsWith('/api/billing/')) return { staleTime: 15_000, maxAge: 60_000 }
  if (p === '/api/whatsapp/status' || p === '/api/store/whatsapp') return { ...normal, staleTime: 60_000 }
  // Campañas: se refrescan seguido, pero mientras llega lo nuevo se sigue viendo lo anterior
  // (el historial de una tienda grande tarda unos segundos y no debe ocultar la pantalla)
  if (p.startsWith('/api/whatsapp/campaigns/')) return { staleTime: 15_000, maxAge: 600_000 }
  if (p === '/api/data/dashboard/whatsapp') return { staleTime: 15_000, maxAge: 60_000 }
  if (p === '/api/whatsapp/unread') return { ...normal, staleTime: 30_000, poll: 30_000 }
  if (p === '/api/whatsapp/conversations') return { ...normal, staleTime: 15_000, poll: 15_000 }
  // Threads can mark messages read. Only explicit preview requests may use the cache.
  if (p.startsWith('/api/whatsapp/conversations/')) return new URL(path, 'https://local').searchParams.get('preview') === '1' ? { ...normal, staleTime: 6_000 } : null
  // Todos los contactos con teléfono (Campañas): miles de filas. No se vuelven a
  // pedir solo por regresar a la pestaña; sí cuando cambian (invalidación).
  if (p === '/api/data/contacts') {
    const sp = new URL(path, 'https://local').searchParams
    if (sp.get('all') === '1' && sp.get('fields') === 'lite') return { staleTime: 600_000, maxAge: 1_800_000 }
  }
  if (p.startsWith('/api/data/') || p === '/api/store' || p.startsWith('/api/store/') || p === '/api/stores') return normal
  return null
}

/**
 * Al terminar una campaña: lo que puede haber cambiado (bajas de marketing,
 * conversaciones nuevas). Cada lote solo refresca lo de WhatsApp; si cada lote
 * invalidara los contactos, Campañas volvería a descargar toda la base por lote.
 */
export const CAMPAIGN_SENT_RESOURCES = ['/api/data/dashboard', '/api/data/contacts', '/api/data/commercial']

export function mutationResources(path: string): string[] {
  if (path.startsWith('/api/whatsapp/campaigns/send')) return ['/api/whatsapp/']
  // La foto de una plantilla solo cambia esa foto (no hace falta recargar contactos)
  if (path.startsWith('/api/whatsapp/template-image')) return ['/api/whatsapp/template-image']
  // Guardar o descartar lo pendiente de una campaña solo cambia esa lista
  if (path.startsWith('/api/whatsapp/campaigns/pending')) return ['/api/whatsapp/campaigns/pending']
  // Guardar un contacto con una zona nueva («Otra…») la agrega a los catálogos
  if (path.startsWith('/api/data/contacts')) return ['/api/data/contacts', '/api/data/commercial', '/api/data/dashboard', '/api/whatsapp/', '/api/data/config']
  // Registrar una actividad puede adjuntar una cotización subida
  if (path.startsWith('/api/data/commercial/activities')) return ['/api/data/commercial', '/api/data/contacts', '/api/data/dashboard', '/api/data/quotes']
  if (path.startsWith('/api/data/commercial')) return ['/api/data/commercial', '/api/data/contacts', '/api/data/dashboard']
  if (path.startsWith('/api/data/reminders')) return ['/api/data/reminders', '/api/data/dashboard']
  // Enviar, subir o aceptar una cotización registra la actividad del contacto
  // en Comercial; el guardado automático del editor solo cambia cotizaciones
  if (path.startsWith('/api/data/quotes')) {
    return /\/(send|status|upload)$/.test(path.split('?')[0])
      ? ['/api/data/quotes', '/api/data/commercial', '/api/data/contacts', '/api/data/dashboard']
      : ['/api/data/quotes']
  }
  if (path.startsWith('/api/data/config')) return ['/api/data/config']
  // Productos y listas de precios: también el uso del plan (Configuración → Plan)
  if (path.startsWith('/api/data/products')) return ['/api/data/products', '/api/billing/usage']
  if (path.startsWith('/api/whatsapp/')) return ['/api/whatsapp/', '/api/data/dashboard', '/api/data/contacts', '/api/data/commercial']
  if (path.startsWith('/api/store') || path === '/api/me') return ['/api/']
  return []
}

export function normalizedPath(input: string) {
  const url = new URL(input, 'https://local')
  url.searchParams.sort()
  return url.pathname + url.search
}
