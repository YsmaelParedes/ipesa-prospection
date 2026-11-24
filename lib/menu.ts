/**
 * El menú de la app: qué grupos y pantallas hay, qué ve cada quien y en cuál
 * está según la dirección. Lo dibujan components/SideMenu.tsx (menú lateral) y
 * AppShell (barra de abajo del celular y título de la pantalla).
 *
 * Un grupo se despliega y muestra sus pantallas. Las de una misma sección
 * (Hoy, Cartera y Oportunidades) comparten ruta y se distinguen con ?tab=; la
 * principal no lleva ?tab=. En la computadora el menú las cambia; en el
 * celular, donde el menú está escondido, siguen las pestañas en la página.
 */
import type { StoreModules } from './stores'

export type MenuIcon = 'home' | 'whatsapp' | 'contacts' | 'commercial' | 'sales' | 'chart' | 'calendar' | 'formulas' | 'settings'

export type MenuPageId =
  | 'inicio' | 'conversaciones' | 'campanas' | 'resultados' | 'contactos' | 'hoy' | 'cartera' | 'oportunidades'
  | 'cotizaciones' | 'productos' | 'equipo' | 'avance' | 'desempeno' | 'agenda' | 'formulas' | 'configuracion'

export type MenuPage = {
  id: MenuPageId
  label: string
  path: string
  /** Valor de ?tab= (sin él, es la principal de su ruta). */
  tab?: string
  /** Título de la barra superior. */
  title: string
  subtitle: string
  /** Se ve con candado (viene en Cubeta). */
  locked?: boolean
}

export type MenuGroupId = 'whatsapp' | 'comercial' | 'ventas' | 'reportes'

export type MenuEntry =
  | { kind: 'page'; icon: MenuIcon; page: MenuPage }
  | { kind: 'group'; id: MenuGroupId; label: string; icon: MenuIcon; pages: MenuPage[] }
  /** Línea entre lo suelto y los grupos. */
  | { kind: 'divider'; id: string }

export type MenuAccess = {
  isAdmin: boolean
  /** null: todavía no se sabe (sin tienda); se ve todo lo que no es de administradores. */
  modules: StoreModules | null
  /** Reportes incluidos en su plan. */
  reports: boolean
}

const single = (id: MenuPageId, label: string, path: string, subtitle: string): MenuPage => ({ id, label, path, title: label, subtitle })

export const CONFIG_PAGE = single('configuracion', 'Configuración', '/configuracion', 'Tu tienda, equipo e integraciones')

/**
 * Lo que ve esta persona, en orden: arriba lo suelto de todos los días, luego
 * los grupos y al final las herramientas. Así lo suelto no se mueve al abrir
 * un grupo.
 */
export function menuFor({ isAdmin, modules, reports }: MenuAccess): MenuEntry[] {
  const group = (id: MenuGroupId, label: string, icon: MenuIcon, pages: Omit<MenuPage, 'title' | 'subtitle'>[]): MenuEntry =>
    ({ kind: 'group', id, label, icon, pages: pages.map(p => ({ ...p, title: p.label, subtitle: label })) })
  const page = (icon: MenuIcon, p: MenuPage): MenuEntry => ({ kind: 'page', icon, page: p })
  const divider = (id: string): MenuEntry => ({ kind: 'divider', id })

  // Apagado se le muestra al administrador, para ofrecérselo
  const whatsapp = !modules || modules.whatsapp || isAdmin
  // Las campañas salen por el WhatsApp de la tienda y las maneja un administrador
  const campaigns = isAdmin && (!modules || (modules.campaigns && modules.whatsapp))
  const locked = !reports || undefined

  return [
    page('home', single('inicio', 'Inicio', '/', 'Lo que hay que atender hoy')),
    page('calendar', single('agenda', 'Agenda', '/recordatorios', 'Recordatorios y seguimientos')),
    page('contacts', single('contactos', 'Contactos', '/contactos', 'Tu base de clientes')),
    divider('grupos'),
    ...(campaigns
      ? [group('whatsapp', 'WhatsApp', 'whatsapp', [
        { id: 'conversaciones', label: 'Conversaciones', path: '/whatsapp' },
        { id: 'campanas', label: 'Campañas', path: '/campanas' },
        { id: 'resultados', label: 'Resultados', path: '/campanas', tab: 'resultados' },
      ])]
      // Con una sola pantalla no hay nada que desplegar
      : whatsapp
        ? [page('whatsapp', { id: 'conversaciones', label: 'WhatsApp', path: '/whatsapp', title: 'WhatsApp', subtitle: 'Conversaciones con tus clientes' })]
        : []),
    group('comercial', 'Sistema Comercial', 'commercial', [
      { id: 'hoy', label: 'Hoy', path: '/comercial' },
      { id: 'cartera', label: 'Cartera', path: '/comercial', tab: 'cartera' },
      { id: 'oportunidades', label: 'Oportunidades', path: '/comercial', tab: 'oportunidades' },
    ]),
    group('ventas', 'Ventas', 'sales', [
      { id: 'cotizaciones', label: 'Cotizaciones', path: '/cotizaciones' },
      { id: 'productos', label: 'Productos', path: '/productos' },
    ]),
    // Cada quien ve lo suyo; en Litro, con candado
    group('reportes', 'Reportes', 'chart', [
      isAdmin ? { id: 'equipo', label: 'Equipo hoy', path: '/reportes', locked } : { id: 'avance', label: 'Mi avance', path: '/reportes', locked },
      { id: 'desempeno', label: 'Desempeño', path: '/reportes', tab: 'desempeno', locked },
    ]),
    ...(!modules || modules.formulas
      ? [divider('herramientas'), page('formulas', single('formulas', 'Fórmulas', '/formulas', 'Igualación de colores'))]
      : []),
  ]
}

export const menuPages = (entries: MenuEntry[]): MenuPage[] => entries.flatMap(e => e.kind === 'page' ? [e.page] : e.kind === 'group' ? e.pages : [])

/** En qué pantalla está según la dirección (la ficha de un producto cuenta como Productos). null: ninguna del menú. */
export function pageAt(entries: MenuEntry[], pathname: string, tab: string | null): MenuPage | null {
  const here = [...menuPages(entries), CONFIG_PAGE].filter(p => p.path === '/' ? pathname === '/' : pathname === p.path || pathname.startsWith(`${p.path}/`))
  return here.find(p => p.tab && p.tab === tab) ?? here.find(p => !p.tab) ?? here[0] ?? null
}

export function groupOf(entries: MenuEntry[], page: MenuPage | null): MenuGroupId | null {
  const e = page && entries.find(x => x.kind === 'group' && x.pages.some(p => p.id === page.id))
  return e && e.kind === 'group' ? e.id : null
}

/**
 * A dónde lleva una pantalla. Dentro de Reportes los filtros viven en la
 * dirección: al pasar de un reporte a otro se conservan.
 */
export function pageHref(page: MenuPage, at?: { pathname: string; search: URLSearchParams }): string {
  const qs = new URLSearchParams(at && page.path === '/reportes' && at.pathname === '/reportes' ? at.search : undefined)
  qs.delete('tab')
  if (page.tab) qs.set('tab', page.tab)
  const s = qs.toString()
  return s ? `${page.path}?${s}` : page.path
}
