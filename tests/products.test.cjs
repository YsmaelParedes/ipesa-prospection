require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  netPrice, grossPrice, priceIn, marginOf, stockLabel, quoteUnit, mainListOf,
  guessMapping, listNameOf, priceColumnsOf, parseNumber, parseTax, parseKind, buildImport, productRows, headerRowIndex,
} = require('../lib/products.ts')

// Encabezados del Excel de inventario de Pulpos (Productos-2026-11-21.xlsx)
const PULPOS = ['Nombre del Producto', 'Identificador (No Cambiar)', 'Es un Servicio', 'Se Vende', 'Descripción', 'Categoría', 'Marca',
  'Unidad de Venta', 'Código de Barras', 'SKU', 'Variantes de Tamaño', 'Variantes de Color', 'Variantes de Material', 'Variantes de Estilo',
  'Usa Lotes', 'Lote', 'Fabricación del Lote', 'Caducidad del Lote', 'Utiliza Stock', 'Stock Total ', 'Stock Mínimo ', 'Stock Apartado ',
  'Ubicación ', 'Precio Público', 'Precio Precio tarjeta débito o crédito', 'Precio Aplazo', 'Precio Atlixco',
  'Precio Volumen 12 bultos en adelante', 'Costo', 'Impuestos', 'IVA', 'IEPS', 'Clave SAT', 'Receta Médica', 'Catálogo en Línea']

test('precio sin IVA para la cotización y de vuelta', () => {
  assert.equal(netPrice(831, 16), 716.38)
  assert.equal(netPrice(876, 16), 755.17)
  assert.equal(netPrice(60, 0), 60)
  assert.equal(netPrice(108, 8), 100)
  assert.equal(grossPrice(716.38, 16), 831)
  assert.equal(grossPrice(100, 0), 100)
})

test('precio en una lista: si no tiene, el de la principal y lo dice', () => {
  const p = { prices: { pub: 3053, tarjeta: 3215 } }
  assert.deepEqual(priceIn(p, 'tarjeta', 'pub'), { price: 3215, fallback: false })
  assert.deepEqual(priceIn(p, 'atlixco', 'pub'), { price: 3053, fallback: true })
  assert.deepEqual(priceIn(p, 'pub', 'pub'), { price: 3053, fallback: false })
  assert.deepEqual(priceIn(p, null, 'pub'), { price: 3053, fallback: false })
  assert.deepEqual(priceIn({ prices: {} }, 'tarjeta', 'pub'), { price: null, fallback: false })
  assert.equal(mainListOf([{ id: 'a', name: 'A', is_main: false }, { id: 'b', name: 'B', is_main: true }]).id, 'b')
  assert.equal(mainListOf([]), null)
})

test('margen y ganancia como en el punto de venta ($831 con costo $588 → 29 %, $243)', () => {
  assert.deepEqual(marginOf(831, 588), { gain: 243, pct: 29 })
  assert.deepEqual(marginOf(3557, 1990.56), { gain: 1566.44, pct: 44 })
  assert.equal(marginOf(0, 10), null)
  assert.equal(marginOf(100, null), null)
})

test('existencias con su unidad; los servicios no llevan', () => {
  assert.equal(stockLabel({ kind: 'product', stock: 14, unit: 'Pieza' }), '14 pieza')
  assert.equal(stockLabel({ kind: 'product', stock: 0, unit: 'Galón' }), '0 galón')
  assert.equal(stockLabel({ kind: 'product', stock: 2.5, unit: null }), '2.5')
  assert.equal(stockLabel({ kind: 'service', stock: 3, unit: 'Metro' }), null)
  assert.equal(stockLabel({ kind: 'product', stock: null, unit: 'Litro' }), null)
  assert.equal(quoteUnit('Kit (Conjunto de piezas)'), 'kit (conjunto de pie')
})

test('columnas: reconoce el Excel de Pulpos sin confundir clave SAT, stock mínimo ni precios', () => {
  assert.deepEqual(guessMapping(PULPOS), {
    name: 'Nombre del Producto', key: 'Identificador (No Cambiar)', kind: 'Es un Servicio', sku: 'SKU',
    barcode: 'Código de Barras', category: 'Categoría', brand: 'Marca', unit: 'Unidad de Venta', description: 'Descripción',
    stock: 'Stock Total ', cost: 'Costo', tax_rate: 'IVA',
  })
  assert.deepEqual(priceColumnsOf(PULPOS).map(c => c.name),
    ['Público', 'Tarjeta débito o crédito', 'Aplazo', 'Atlixco', 'Volumen 12 bultos en adelante'])
  assert.equal(guessMapping(['Clave SAT', 'Nombre']).key, undefined)
  assert.equal(guessMapping(['Precio de compra', 'Nombre']).cost, 'Precio de compra')
})

test('encabezados: la primera fila con datos (Pulpos deja dos filas vacías arriba)', () => {
  const blank = Array(5).fill('')
  assert.equal(headerRowIndex([blank, blank, ['Nombre del Producto', 'SKU', '', ''], ['Vinílica', '1']]), 2)
  assert.equal(headerRowIndex([['Inventario de la tienda', '', ''], ['Nombre', 'Precio'], ['Rodillo', 90]]), 1)
  assert.equal(headerRowIndex([['Nombre'], ['Rodillo']]), 0)
  assert.equal(headerRowIndex([]), -1)
})

test('nombre de la lista a partir de la columna', () => {
  assert.equal(listNameOf('Precio'), 'Público')
  assert.equal(listNameOf('Precio de venta'), 'Público')
  assert.equal(listNameOf('Precios mayoreo'), 'Mayoreo')
  assert.equal(listNameOf('Precio Atlixco'), 'Atlixco')
})

test('números, IVA y tipo como vienen en un Excel', () => {
  assert.equal(parseNumber('$1,234.50'), 1234.5)
  assert.equal(parseNumber('1234,5'), 1234.5)
  assert.equal(parseNumber(' 77 '), 77)
  assert.equal(parseNumber(''), null)
  assert.equal(parseNumber('n/a'), null)
  assert.equal(parseTax(0.16), 16)
  assert.equal(parseTax('16 %'), 16)
  assert.equal(parseTax('IVA 8%'), 8)
  assert.equal(parseTax('Exento'), 0)
  assert.equal(parseTax(0), 0)
  assert.equal(parseTax(0.1), null)
  assert.equal(parseKind('Si'), 'service')
  assert.equal(parseKind('Sí'), 'service')
  assert.equal(parseKind('No'), 'product')
  assert.equal(parseKind('Servicio'), 'service')
  assert.equal(parseKind(''), undefined)
})

test('importar: filas de Pulpos a productos, sin mandar lo vacío', () => {
  const rows = [
    { 'Nombre del Producto': 'WALL COVER PLUS - BLANCO', 'Identificador (No Cambiar)': 'wall-cover', 'Es un Servicio': 'No', 'Categoría': 'IMPERMEABILIZANTES',
      'Marca': 'IPESA', 'Unidad de Venta': 'Cubeta', 'Código de Barras': '7501411115640', 'SKU': '1209054', 'Stock Total ': 0,
      'Precio Público': 3053, 'Precio Precio tarjeta débito o crédito': 3215, 'Precio Aplazo': '', 'Costo': 1990.56, 'IVA': 0.16, 'Descripción': '' },
    { 'Nombre del Producto': 'APLICACION EN MUROS', 'Identificador (No Cambiar)': 'aplicacion', 'Es un Servicio': 'Si', 'Unidad de Venta': 'Metro',
      'Stock Total ': 0, 'Precio Público': 60, 'IVA': 0.16 },
    { 'Nombre del Producto': '', 'Identificador (No Cambiar)': '', 'SKU': '' },
  ]
  const headers = Object.keys(rows[0])
  const plan = buildImport(rows, guessMapping(headers), priceColumnsOf(headers), { pricesIncludeTax: true })
  assert.deepEqual(plan.lists, ['Público', 'Tarjeta débito o crédito', 'Aplazo'])
  assert.equal(plan.skipped, 1)
  assert.deepEqual(plan.items[0], {
    name: 'WALL COVER PLUS - BLANCO', key: 'wall-cover', sku: '1209054', kind: 'product', barcode: '7501411115640',
    category: 'IMPERMEABILIZANTES', brand: 'IPESA', unit: 'Cubeta', stock: 0, cost: 1990.56, tax_rate: 16, prices: [3053, 3215, null],
  })
  // Un servicio no lleva existencias
  assert.equal(plan.items[1].kind, 'service')
  assert.equal(plan.items[1].stock, undefined)
})

test('importar: precios sin IVA se pasan a con IVA; dos columnas con el mismo nombre son una lista', () => {
  const rows = [{ Nombre: 'Rodillo', Precio: 100, 'Precio público': 90, Costo: 50, IVA: 8 }]
  const cols = [{ header: 'Precio', name: 'Público' }, { header: 'Precio público', name: 'público' }]
  const plan = buildImport(rows, guessMapping(Object.keys(rows[0])), cols, { pricesIncludeTax: false })
  assert.deepEqual(plan.lists, ['Público'])
  assert.deepEqual(plan.items[0].prices, [97.2])
  assert.equal(plan.items[0].cost, 54)
  // Una lista sin nombre no se importa
  const none = buildImport(rows, { name: 'Nombre' }, [{ header: 'Precio', name: '  ' }], { pricesIncludeTax: true })
  assert.deepEqual(none.lists, [])
  assert.deepEqual(none.items[0].prices, [])
})

test('descargar y volver a subir: las columnas se reconocen solas', () => {
  const lists = [{ id: 'pub', name: 'Público', is_main: true }, { id: 'apl', name: 'Aplazo', is_main: false }]
  const p = { id: 'p1', kind: 'product', name: 'Rodillo', ext_key: null, sku: 'R1', barcode: null, category: 'COMPLEMENTOS', brand: null,
    unit: 'Pieza', description: null, cost: 50, tax_rate: 16, stock: 3, prices: { pub: 90 }, created_at: '', updated_at: '' }
  const [row] = productRows([p], lists, { withCost: true })
  assert.equal(row['Clave'], 'p1')
  assert.equal(row['Precio Público'], 90)
  assert.equal(row['Precio Aplazo'], '')
  const headers = Object.keys(row)
  const plan = buildImport([row], guessMapping(headers), priceColumnsOf(headers), { pricesIncludeTax: true })
  assert.deepEqual(plan.lists, ['Público', 'Aplazo'])
  assert.deepEqual(plan.items[0], { name: 'Rodillo', key: 'p1', kind: 'product', sku: 'R1', category: 'COMPLEMENTOS', unit: 'Pieza', stock: 3, cost: 50, tax_rate: 16, prices: [90, null] })
  // Sin costo para quien no es administrador
  assert.equal('Costo' in productRows([p], lists, { withCost: false })[0], false)
})
