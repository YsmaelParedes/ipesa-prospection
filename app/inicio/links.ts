/** Páginas del sitio de presentación. Las principales van en el menú; el resto, en "Más" (y todas en el pie). */
export const SITE_LINKS = [
  { href: '/inicio', label: 'Inicio' },
  { href: '/inicio/sistema-comercial', label: 'Sistema Comercial' },
  { href: '/inicio/contactos', label: 'Contactos' },
  { href: '/inicio/whatsapp', label: 'WhatsApp' },
  { href: '/inicio/precios', label: 'Precios' },
]
export const MORE_LINKS = [
  { href: '/inicio/agente-ia', label: 'Agente de IA' },
  { href: '/inicio/para-tu-tienda', label: 'Para tu tienda' },
  { href: '/inicio/funciones', label: 'Funciones' },
  { href: '/inicio/como-empezar', label: 'Cómo empezar' },
  { href: '/inicio/preguntas', label: 'Preguntas' },
]
export const ALL_LINKS = [...SITE_LINKS, ...MORE_LINKS]
