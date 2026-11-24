require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { menuFor, menuPages, pageAt, groupOf, pageHref } = require('../lib/menu.ts')

const ALL = { whatsapp: true, campaigns: true, formulas: true }
const NONE = { whatsapp: false, campaigns: false, formulas: false }
const ADMIN = { isAdmin: true, modules: ALL, reports: true }
const SELLER = { isAdmin: false, modules: ALL, reports: true }

/** El menú como texto: «Grupo: pantallas» o la pantalla suelta (* = candado, --- = línea). */
const outline = access => menuFor(access).map(e => e.kind === 'divider' ? '---' : e.kind === 'page'
  ? e.page.label
  : `${e.label}: ${e.pages.map(p => p.label + (p.locked ? '*' : '')).join(', ')}`)
const LOOSE = ['Inicio', 'Agenda', 'Contactos', '---']
const SALES = ['Sistema Comercial: Hoy, Cartera, Oportunidades', 'Ventas: Cotizaciones, Productos']

test('administrador con todos los módulos: lo suelto arriba, los grupos y al final Fórmulas', () => {
  assert.deepEqual(outline(ADMIN), [
    ...LOOSE, 'WhatsApp: Conversaciones, Campañas, Resultados', ...SALES, 'Reportes: Equipo hoy, Desempeño', '---', 'Fórmulas',
  ])
})

test('vendedor: sin Campañas, así que WhatsApp no se despliega; Mi avance en lugar de Equipo hoy', () => {
  assert.deepEqual(outline(SELLER), [...LOOSE, 'WhatsApp', ...SALES, 'Reportes: Mi avance, Desempeño', '---', 'Fórmulas'])
})

test('Litro: WhatsApp se ofrece al administrador, los reportes llevan candado y sin Fórmulas no queda línea al final', () => {
  assert.deepEqual(outline({ isAdmin: true, modules: NONE, reports: false }), [
    ...LOOSE, 'WhatsApp', ...SALES, 'Reportes: Equipo hoy*, Desempeño*',
  ])
  // Sin WhatsApp, el vendedor no lo ve
  assert.equal(outline({ isAdmin: false, modules: NONE, reports: true }).includes('WhatsApp'), false)
})

test('campañas piden el módulo y que WhatsApp esté activo', () => {
  assert.equal(outline({ ...ADMIN, modules: { ...ALL, whatsapp: false } })[4], 'WhatsApp')
  assert.equal(outline({ ...ADMIN, modules: { ...ALL, campaigns: false } })[4], 'WhatsApp')
})

test('una sola pantalla con cada nombre', () => {
  const names = menuPages(menuFor(ADMIN)).map(p => p.label)
  assert.equal(new Set(names).size, names.length)
})

test('en qué pantalla está según la dirección', () => {
  const at = (path, tab = null, access = ADMIN) => pageAt(menuFor(access), path, tab)?.id ?? null
  assert.equal(at('/'), 'inicio')
  assert.equal(at('/comercial'), 'hoy')
  assert.equal(at('/comercial', 'cartera'), 'cartera')
  assert.equal(at('/comercial', 'oportunidades'), 'oportunidades')
  // Nombres de antes: se quedan en la principal mientras la página redirige
  assert.equal(at('/comercial', 'acumulado'), 'hoy')
  assert.equal(at('/campanas'), 'campanas')
  assert.equal(at('/campanas', 'resultados'), 'resultados')
  assert.equal(at('/reportes'), 'equipo')
  assert.equal(at('/reportes', null, SELLER), 'avance')
  assert.equal(at('/reportes', 'desempeno', SELLER), 'desempeno')
  // La ficha de un producto y el editor de una cotización cuentan como su sección
  assert.equal(at('/productos/123'), 'productos')
  assert.equal(at('/cotizaciones/123'), 'cotizaciones')
  // ?tab= de Configuración no es del menú
  assert.equal(at('/configuracion', 'equipo'), 'configuracion')
  assert.equal(at('/campanas', null, SELLER), null)
  assert.equal(at('/otra'), null)
})

test('el grupo de la pantalla actual', () => {
  const entries = menuFor(ADMIN)
  assert.equal(groupOf(entries, pageAt(entries, '/comercial', 'cartera')), 'comercial')
  assert.equal(groupOf(entries, pageAt(entries, '/whatsapp', null)), 'whatsapp')
  assert.equal(groupOf(entries, pageAt(entries, '/', null)), null)
  assert.equal(groupOf(entries, null), null)
  const seller = menuFor(SELLER)
  assert.equal(groupOf(seller, pageAt(seller, '/whatsapp', null)), null)
})

test('título: la subsección y, debajo, su grupo', () => {
  const entries = menuFor(ADMIN)
  const p = pageAt(entries, '/comercial', 'cartera')
  assert.deepEqual([p.title, p.subtitle], ['Cartera', 'Sistema Comercial'])
  const wa = pageAt(menuFor(SELLER), '/whatsapp', null)
  assert.deepEqual([wa.title, wa.subtitle], ['WhatsApp', 'Conversaciones con tus clientes'])
})

test('direcciones: la principal sin ?tab=; en Reportes se conservan los filtros', () => {
  const entries = menuFor(ADMIN)
  const get = id => menuPages(entries).find(p => p.id === id)
  assert.equal(pageHref(get('hoy')), '/comercial')
  assert.equal(pageHref(get('cartera')), '/comercial?tab=cartera')
  assert.equal(pageHref(get('resultados')), '/campanas?tab=resultados')
  const inReports = { pathname: '/reportes', search: new URLSearchParams('tab=desempeno&period=year&zone=Centro') }
  assert.equal(pageHref(get('equipo'), inReports), '/reportes?period=year&zone=Centro')
  assert.equal(pageHref(get('desempeno'), inReports), '/reportes?period=year&zone=Centro&tab=desempeno')
  // Desde otra sección, sus parámetros no se llevan
  assert.equal(pageHref(get('desempeno'), { pathname: '/comercial', search: new URLSearchParams('tab=cartera&id=1') }), '/reportes?tab=desempeno')
  assert.equal(pageHref(get('cartera'), inReports), '/comercial?tab=cartera')
})
