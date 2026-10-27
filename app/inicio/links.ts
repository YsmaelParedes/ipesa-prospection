import { Ic } from './_ui'
import s from './inicio.module.css'

/**
 * Menú del sitio de presentación. En la barra van solo los menús principales;
 * "Producto" y "Para tu tienda" abren un panel con sus páginas agrupadas por
 * categoría (ícono, nombre y una línea de qué es). El pie usa los mismos grupos.
 */
export type MenuItem = { href: string; label: string; desc: string; icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; tone: string }
export type MenuGroup = { title: string; items: MenuItem[] }
export type NavEntry =
  | { label: string; href: string }
  | { label: string; groups: MenuGroup[]; footer?: { href: string; label: string } }

const PRODUCT: MenuGroup[] = [
  {
    title: 'Ventas',
    items: [
      { href: '/inicio/sistema-comercial', label: 'Sistema Comercial', desc: 'A quién llamar hoy, cada llamada en 3 toques', icon: Ic.grid, tone: s.tBrand },
      { href: '/inicio/sistema-comercial#oportunidades', label: 'Oportunidades', desc: 'Cada cotización abierta, con su monto', icon: Ic.leads, tone: s.tMagenta },
      { href: '/inicio/sistema-comercial#equipo', label: 'Equipo y metas', desc: 'Cada vendedor contra su meta del día', icon: Ic.users, tone: s.tAmber },
    ],
  },
  {
    title: 'Clientes',
    items: [
      { href: '/inicio/contactos', label: 'Contactos', desc: 'Tu base por zonas, con WhatsApp o fijo', icon: Ic.contacts, tone: s.tCyan },
      { href: '/inicio/funciones#agenda', label: 'Agenda y avisos', desc: 'El resumen de tu día en el celular', icon: Ic.bell, tone: s.tTeal },
      { href: '/inicio/funciones#equipo', label: 'Permisos', desc: 'Tu base se queda en tu tienda', icon: Ic.lock, tone: s.tAmber },
    ],
  },
  {
    title: 'Próximamente',
    items: [
      { href: '/inicio/whatsapp', label: 'WhatsApp y agente de IA', desc: 'Muy pronto en tu CRM', icon: Ic.chat, tone: s.tWa },
    ],
  },
]

const STORES: MenuGroup[] = [
  {
    title: 'Por tipo de negocio',
    items: [
      { href: '/inicio/para-tu-tienda/tiendas-de-pintura', label: 'Tiendas de pintura', desc: 'Pintores, constructoras y clientes de hogar', icon: Ic.store, tone: s.tBrand },
      { href: '/inicio/para-tu-tienda/ferreterias', label: 'Ferreterías', desc: 'Clientes de mostrador y rutas por zona', icon: Ic.store, tone: s.tAmber },
      { href: '/inicio/para-tu-tienda/distribuidores', label: 'Distribuidores', desc: 'Cotizaciones grandes y vendedores en la calle', icon: Ic.store, tone: s.tCyan },
    ],
  },
]

export const NAV: NavEntry[] = [
  { label: 'Producto', groups: PRODUCT, footer: { href: '/inicio/funciones', label: 'Ver todas las funciones' } },
  { label: 'Para tu tienda', groups: STORES, footer: { href: '/inicio/para-tu-tienda', label: 'Ver todos los giros' } },
  { label: 'Precios', href: '/inicio/precios' },
  { label: 'Cómo empezar', href: '/inicio/como-empezar' },
  { label: 'Preguntas', href: '/inicio/preguntas' },
]

/** Pie de página: los mismos grupos, más ayuda. */
export const FOOTER_GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  { title: 'Producto', links: [{ href: '/inicio/sistema-comercial', label: 'Sistema Comercial' }, { href: '/inicio/contactos', label: 'Contactos' }, { href: '/inicio/whatsapp', label: 'WhatsApp · Próximamente' }, { href: '/inicio/funciones', label: 'Funciones' }] },
  { title: 'Para tu tienda', links: STORES[0].items.map(i => ({ href: i.href, label: i.label })) },
  { title: 'Empieza', links: [{ href: '/inicio/precios', label: 'Precios' }, { href: '/inicio/como-empezar', label: 'Cómo empezar' }, { href: '/inicio/preguntas', label: 'Preguntas' }, { href: '/registro', label: 'Crear cuenta gratis' }, { href: '/login', label: 'Iniciar sesión' }] },
]
